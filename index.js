const { text, response } = require('express')
const express = require('express')
const fetch = require("node-fetch")
const app = express()
const port = 3000


const regexes = [
    // Remove
    [/\r?\n?DESCRIPTION:([^\r\n]*?\r?\n)(\ [^\r\n]*?\r?\n)*/gi, "\r\n"],
    [/\r?\n?((X-(\S+)-)?CALNAME):([^\r\n]*?\r?\n)(\ [^\r\n]*?\r?\n)*/gi, "\r\n"], // Owner name
    [/\r?\n?ORGANIZER:([^\r\n]*?\r?\n)(\ [^\r\n]*?\r?\n)*/gi, "\r\n"],
    [/\r?\n?ATTENDEE[:;]([^\r\n]*?\r?\n)(\ [^\r\n]*?\r?\n)*/gi, "\r\n"],
    [/\r?\n?ORGANIZER[:;]([^\r\n]*?\r?\n)(\ [^\r\n]*?\r?\n)*/gi, "\r\n"],
    [/(\r?\n?((X-(\S+)-)?LOCATIONS?):([^\r\n]*?\r?\n)(\ [^\r\n]*?\r?\n)*)/gi, "\r\n"],

    // Remove domain
    [/@google\.com/gi,""], // UID in google, put before email regex

    // Set to busy
    [/\r?\n?X-MICROSOFT-CDO-BUSYSTATUS:([^\r\n]*?\r?\n)(\ [^\r\n]*?\r?\n)*/gi, // Change Outlook Tentative -> Busy
         "\r\nX-MICROSOFT-CDO-BUSYSTATUS: Busy\r\n"],
    [/\r?\n?SUMMARY:([^\r\n]*?\r?\n)(\ [^\r\n]*?\r?\n)*/gi, 
        "\r\nSUMMARY: Busy\r\n"] ,
    [/((?!\W)[\w\-\+]+?@[\w\-\+]+\.)((?!\W)\w+)/gi,
         "anon@anon.com"] // email censor
]

function regexReplace(input) {
    let result = input;
    for(let i=0;i<regexes.length;i++) {
        result = result.replace(regexes[i][0],regexes[i][1])
    }
    return result;
}


function getPublicGoogle(publicUrl) {
    // Examlple:
    //      https://calendar.google.com/calendar/embed?src=iw.jewish%23holiday%40group.v.calendar.google.com&ctz=Asia%2FJerusalem
    const id = publicUrl.split('?src=')[1].split('&')[0];
    return "https://calendar.google.com/calendar/ical/" + id + "/public/basic.ics";
}

// ============ READ CONFIG FILE

var icalConfig =  JSON.parse(require("fs").readFileSync("config.json"))
console.log("Found " + icalConfig.length + " icals configs");




// ============ Log Access

app.use(require('express-log-url'));




app.get('/', (req, res) => res.sendStatus(404))


app.get('/calendarview/frontconfig', (req, res) => {
    res.setHeader("Access-Control-Allow-Origin","yoniwas.com, localhost:"+port);
    let result = [];
    var fullUrl = /* req.protocol + '://' + req.get('host') + */ req.originalUrl;
    for (let i=0;i<icalConfig.length;i++) {
        result.push({
            type: "ical",
            url: fullUrl.replace("frontconfig",i + "/ical")
        })
    }
    res.send(result);
})

app.use('/calendarview', express.static('./calendarview/',{index:"index.html",}));

// ============ Setup cache

const ExpressCache = require('express-cache-middleware')
const cacheManager = require('cache-manager')
 
const cacheMiddleware = new ExpressCache(
    cacheManager.caching({
        store: 'memory', max: 100, ttl: 5*60  /*Seconds*/
    })
)

cacheMiddleware.attach(app)


app.get('/calendarview/:id/ical',(req,res)=>{
    res.setHeader("Access-Control-Allow-Origin","yoniwas.com, localhost:"+port);
    const index = parseInt(req.params.id || "-2");
    if (index > -1 && index < icalConfig.length) {
        const cal = icalConfig[index];
        const url = cal.isPublicGoogle? getPublicGoogle(cal.url):cal.url;
        console.log("Fetching iCal");
        fetch.default(url).then((r)=>r.text()).then((txt)=>{
            if (cal.hideInfo) {
                res.send(regexReplace(txt));
                //res.send(txt);
            }
            else {
                res.send(txt);
            }
        }).catch((e)=>{
            res.send({error:e})
        })
    }
    else {
        res.send({error:"Can't find ical with id " + req.params.id});
    }
})


app.listen(port, () => console.log(`Example app listening at http://localhost:${port}`))
