/*global ICAL,$,log,moment */
// Any copyright is dedicated to the Public Domain.
// http://creativecommons.org/publicdomain/zero/1.0/

// Return a Promise that resolves to jCal data of the ICAL file at `url`.
function get_ical_data(url) {
  return new Promise((resolve, reject) => {
    var req = new XMLHttpRequest();
    req.onreadystatechange = (ev) => {
      if (req.readyState == 4) {
        if (req.status == 200) {
          resolve(ICAL.parse(req.responseText));
        } else {
          reject('Error, HTTP ' + req.status.toString());
        }
      }
    };
    req.onerror = e => reject(e);
    req.open('GET', url, true);
    req.send(null);
  });
}

// Return an EventSource that fetches events from the ICAL file at `url`.
function ical_event_source(url) {
  return {
    id: url,
    events: (start, end, timezone, callback) => {
      get_ical_data(url).then(data => {
        var comp = new ICAL.Component(data);
        var events = comp.getAllSubcomponents('vevent').map(ve => new ICAL.Event(ve));
        var color = comp.getFirstPropertyValue('x-apple-calendar-color');
        console.log('ical: Got %d events', events.length);

        const NormalEvents = events
          //TODO: handle recurring events
          .filter(entry =>
            !entry.isRecurring() &&
            (
              moment(entry.startDate.toJSDate()).isBetween(start, end, null, '[]') ||
              moment(entry.endDate.toJSDate()).isBetween(start, end, null, '[]')
            )
          )
          .map(entry => {
            return {
              id: entry.uid,
              title: entry.summary,
              allDay: entry.startDate.isDate,
              start: entry.startDate.toJSDate(),
              end: entry.endDate.toJSDate(),
              color: color,
              location: entry.location,
              description: entry.description
            };
          });

        const RepeatEvents = events
          .filter(e => e.isRecurring())
          .reduce((arr, e) => {

            let recurrEvents = [];


            // google special case, where not repeating unless has TRIGGER in sub-component valarm
            const hasAlarm = (e.component.getAllSubcomponents() || { "jCal": [""] })
              .filter(c => c.jCal[0].toLowerCase() == "valarm")
              .length > 0;

            let modifiedEnd = false;
            let originalDuration = 0;
            if (hasAlarm && e.endDate.toJSDate() - new Date(start) < 0) {
              originalDuration = e.duration.toSeconds();
              e.endDate = ICAL.Time.fromJSDate(new Date(end))
              modifiedEnd = true;
            }

            const _dstart = ICAL.Time.fromJSDate(new Date(start), true);
            _dstart.resetTo(
              // Date from view start
              _dstart.year, _dstart.month, _dstart.day,

              // Time(+zone) from event source
              e.startDate.hour, e.startDate.minute, e.startDate.second,
              e.startDate.zone
            )



            var expand = new ICAL.RecurExpansion({
              component: e.component,
              dtstart: e.startDate
            });

            var next;
            while (
              (next = expand.next()) &&
              moment(next.toJSDate()).isBefore(start)
            ) {
              // Go through all past occurences
            }

            while (
              !!next &&
              moment(next.toJSDate()).isBetween(start, end, null, '[]')
            ) {

              const startTime = next.toJSDate()
              const endTime = next.toJSDate()
              endTime.setSeconds(endTime.getSeconds() + (modifiedEnd ? originalDuration : e.duration.toSeconds()))

              recurrEvents.push({
                id: e.uid,
                title: e.summary,
                allDay: e.startDate.isDate,
                start: startTime,
                end: endTime,
                color: color,
                location: e.location,
                description: e.description
              })

              next = expand.next();
            }



            return arr.concat(recurrEvents);
          }, []);

        callback(NormalEvents.concat(RepeatEvents))

      });
    }
  };
}

