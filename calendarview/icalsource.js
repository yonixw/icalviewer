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
        log('ical: Got %d events', events.length);

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
          .filter(e=>e.isRecurring())
          .reduce((arr, e) => {

            let recurrEvents = [];

            var expand = new ICAL.RecurExpansion({
              component: e.component,
              dtstart: ICAL.Time.fromJSDate(new Date(start))
            });

            var next;
            while (
              (next = expand.next()) &&
               moment(next.toJSDate()).isBetween(start, end, null, '[]')
            ){
            

              const startString = next.toString().split('T')[0] + 'T' + e.startDate.toJSDate().toISOString().split('T')[1];
              const startTime = new Date(startString);
              const endTime = new Date(startString)
              endTime.setSeconds(endTime.getSeconds() + e.duration.toSeconds())

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

              /* e.startDate.wrappedJSObject.toString()
              "2020-10-25T09:30:00"
              next.toString()
              "2020-11-01T02:00:00"
              e.duration.toSeconds() */

              /*
              [e.startDate.toJSDate(), start.toDate(), next.toJSDate()]
                  0: Sun Oct 25 2020 09:30:00 GMT+0200 (שעון ישראל (חורף)) {}
                  1: Sun Nov 01 2020 02:00:00 GMT+0200 (שעון ישראל (חורף)) {}
                  2: Mon Nov 02 2020 02:00:00 GMT+0200 (שעון ישראל (חורף)) {}
              */

            }
            

            return arr.concat(recurrEvents);
          }, []);

        callback(NormalEvents.concat(RepeatEvents))
          
      });
    }
  };
}

