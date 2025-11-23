"use strict";
const https = require('https'),
    config = require('./config'),
    /*
    Maintaining a list of activities and my preference
    The id field is the workoutId which part of classes object as a response of `api/cult/classes/` API
    */

    ActivityType = {
        "boxing": {
            "id": 8,
            "name": "BOXING",
            "displayText": "Boxing",
            "preference": 3
        },
        "hrx": {
            "id": 69,
            "name": "HRX WORKOUT",
            "displayText": "HRX WORKOUT",
            "preference": 1
        },
        "dance": {
            "id": 56,
            "name": "DANCE FITNESS",
            "displayText": "Dance",
            "preference": 4
        },
        "burn": {
            "id": 66,
            "name": "BURN",
            "displayText": "Burn",
            "preference": 5
        },
        "yoga": {
            "id": 5,
            "name": "EVOLVE YOGA",
            "displayText": "Yoga",
            "preference": 6
        },
        "strength": {
            "id": 69,
            "name": "ADIDAS STRENGTH+",
            "displayText": "Strength",
            "preference": 2
        }
    };

const commonHeaders = {
    "accept": "application/json",
    "apikey": config.apiKey,
    "appversion": config.appVersion,
    "browsername": config.browserName,
    "osname": config.osName,
    "timezone": config.timezone,
    "content-type": "application/json",
    "Cookie": config.cookies
};
const CURE_FIT_HOST = "www.cult.fit";
const URI = {
    "GET_CLASSES": "/api/cult/classes/v2?productType=FITNESS",
    "BOOK_CLASS": "/api/cult/class/${activityID}/book"
};
const HTTP_POST = "POST",
    HTTP_GET = "GET";


const PREFERRED_SLOTS = config.preferredSlots || ['09:00:00'];
const PREFERRED_CENTER = config.preferredCenter || 1515;
const PREFERRED_WORKOUT_NAME = config.preferredWorkout || "HRX WORKOUT";
const ENABLE_WAITLIST = config.enableWaitlist !== false;

const PREFERRED_CLASSES_IN_ORDER = Object.values(ActivityType).filter(
    activity => activity.name === PREFERRED_WORKOUT_NAME
);

function hasBookingForDate(classesForDay) {
    for (let timeSlot of classesForDay.classByTimeList) {
        for (let centerClass of timeSlot.centerWiseClasses) {
            if (centerClass.centerId === PREFERRED_CENTER) {
                for (let classs of centerClass.classes) {
                    if (classs.state === 'BOOKED' || classs.isBooked === true) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

async function main() {
    try {
        let classes = await makeAPICall({}, CURE_FIT_HOST, URI.GET_CLASSES, HTTP_GET, commonHeaders);
        let date = classes.days[classes.days.length - 1].id;
        
        console.log(`Booking for ${date}`);
        
        if (hasBookingForDate(classes.classByDateMap[date])) {
            console.log(`Already booked on ${date}. Skipping.`);
            return;
        }
        
        let slots = [];
        
        for (let slot of PREFERRED_SLOTS) {
            slots = getSlots(classes.classByDateMap[date], slot, PREFERRED_CLASSES_IN_ORDER);
            
            if (slots.length > 0) {
                let classInfo = slots[0];
                console.log(`Found ${PREFERRED_WORKOUT_NAME} at ${slot} on ${date}`);
                
                if (classInfo.state === 'WAITLIST_AVAILABLE') {
                    let waitlistCount = classInfo.waitlistInfo && classInfo.waitlistInfo.waitlistedUserCount || 0;
                    console.log(`Joining waitlist (${waitlistCount} people ahead)`);
                } else {
                    console.log(`Booking (${classInfo.availableSeats} seats available)`);
                }
                
                await bookClass(classInfo.id);
                console.log("Class booked successfully!");
                break;
            }
        }
        
        if (slots.length === 0) {
            console.log(`No ${PREFERRED_WORKOUT_NAME} classes available on ${date}`);
        }
    } catch (error) {
        errorHandler(error);
    }
}

main();


async function bookClass(activityID) {
    return await makeAPICall({}, CURE_FIT_HOST, "/api/cult/class/" + activityID + "/book", HTTP_POST, commonHeaders);
}

function makeAPICall(request, host, path, method, headers) {
    if (config.userAgent) {
        headers['User-Agent'] = config.userAgent;
    }
    if (config.referer) {
        headers['referer'] = config.referer;
    }
    let httpParams = {
        host: host,
        path: path,
        method: method,
        headers: headers
    };
    return new Promise(function (resolve, reject) {
        try {
            let post_req = https.request(httpParams, function (res) {
                res.setEncoding('utf8');
                let responseStatus = parseInt(res.statusCode);
                let response = '';

                res.on('data', function (chunk) {
                    response += chunk;
                });
                res.on('end', function () {
                    let output = (response.length === 0) ? '' : (isResponseJSON(res) ? JSON.parse(response) : response);
                    if (responseStatus !== 200) {
                        reject(response);
                    }
                    return resolve(output);
                });
                res.on('error', function (e) {
                    return reject(e);
                });
            });
            post_req.on('error', function (e) {
                return reject(e);
            });
            post_req.write(JSON.stringify(request));
            post_req.end();
        } catch (error) {
            return reject(error);
        }
    });
}

function isResponseJSON(response) {
    return response.headers['content-type'] === 'application/json; charset=utf-8';
}

function getSlots(classesForDay, slot, classTypes) {
    let classTypeIDs = classTypes.map(function (classType) {
        return classType.id;
    });
    
    let timeSlot = classesForDay.classByTimeList.filter(function (classByTime) {
        return classByTime.id == slot;
    })[0];
    
    if (!timeSlot) {
        return [];
    }
    
    let centerClasses = timeSlot.centerWiseClasses.filter(function (center) {
        return center.centerId == PREFERRED_CENTER;
    })[0];
    
    if (!centerClasses) {
        return [];
    }
    
    let classIDs = centerClasses.classes.filter(function (classs) {
        let filterElement = classTypes.filter(function (classType) {
            return classType.id == classs.workoutId && classType.name == classs.workoutName
        })[0];
        if (!filterElement) {
            return false;
        }
        classs.preference = filterElement.preference;
        
        if (ENABLE_WAITLIST) {
            return classs.state === 'AVAILABLE' || classs.state === 'WAITLIST_AVAILABLE';
        } else {
            return classs.state === 'AVAILABLE';
        }
    })
    .sort(function (class1, class2) {
        return class1.preference - class2.preference;
    });
    
    return classIDs;
}

function errorHandler(error) {
    console.error("Booking failed:", error);
}