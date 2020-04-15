const request = require("request");
const wol = require('wake_on_lan');

class PhilipsTV {
    request = null;
    volume = {
        min: 0,
        max: 0,
        current: 0,
        muted: false
    };

    constructor(config) {
        const api_version = 6;
        const protocol = api_version > 5 ? "https" : "http";
        const port = api_version > 5 ? "1926" : "1925";
        const wolURL = config.wol_url;
        const baseURL = protocol + "://" + config.ip_address + ":" + port + "/" + api_version + "/";
        const httpOptions = {
            rejectUnauthorized: false,
            timeout: 3000,
            auth: {
                user: config.username,
                pass: config.password,
                sendImmediately: false
            }
        };

        this.request = (path, body = null) => {
            return new Promise((success, fail) => {
                request({
                    ...httpOptions,
                    method: body ? "POST" : "GET",
                    body: typeof body === "object" ? JSON.stringify(body) : body,
                    url: `${baseURL}${path}`
                }, (error, response, body) => {
                    if (error) {
                        fail(error);
                    } else {
                        if (body && body.indexOf("{") !== -1) {
                            try {
                                success(JSON.parse(body))
                            } catch (e) {
                                fail(e);
                            }
                        } else {
                            success({});
                        }
                    }
                })
            })
        };

        this.wake = (callback) => {
            if (!wolURL) {
                callback(null, "EMPTY");
                return;
            }
            if (wolURL.substring(0, 3).toUpperCase() === "WOL") {
                //Wake on lan request
                const macAddress = wolURL.replace(/^WOL[:]?[\/]?[\/]?/ig, "");
                wol.wake(macAddress, function (error) {
                    if (error) {
                        callback(error);
                    } else {
                        callback(null, "OK");
                    }
                });
            } else {
                if (wolURL.length > 3) {
                    callback(new Error("Unsupported protocol: ", "ERROR"));
                } else {
                    callback(null, "EMPTY");
                }
            }
        };

        this.request("ambilight/power");
    }

    getPowerState = (callback) => {
        this.request("powerstate").then((data) => {
            callback(null, data.powerstate === "On")
        }).catch(() => {
            callback(null, false)
        })
    };
    setPowerState = (value, callback) => {
        if (value) {
            this.wake((wolState) => {
            });
        }
        this.request("powerstate", {
            powerstate: value ? "On" : "Standby"
        }).then((data) => {
            callback(null, value)
        })
    };

    sendKey = key => this.request("input/key", {key});
    launchApp = app => this.request("activities/launch", app);

    getCurrentSource = (inputs) => {
        return new Promise(async (resolve, reject) => {
            const current = await this.request("activities/current");
            const currentPkgname = current.component.packageName;
            let currentTvPreset = 0;
            let selected = 0;
            if (currentPkgname === "org.droidtv.channels" || currentPkgname === "org.droidtv.playtv") {
                const currentTV = await this.request("activities/tv");
                currentTvPreset = parseInt(currentTV.channel.preset, 10);
            }
            inputs.forEach((item, index) => {
                if (currentTvPreset && item.channel === currentTvPreset) {
                    selected = index
                } else if (item.launch && item.launch.intent && item.launch.intent.component.packageName === currentPkgname) {
                    selected = index
                }
            });
            resolve(selected)
        })
    };

    setSource = async (input, callback) => {
        if (input.channel) {
            await this.sendKey("WatchTV");
            await this.sendKey("Digit" + input.channel);
            await this.sendKey("Confirm");
        } else if (input.launch) {
            await this.launchApp(input.launch);
        } else {
            await this.sendKey("WatchTV");
        }
        callback(null);
    };

    getAmbilightState = (callback) => {
        this.request("ambilight/power").then((data) => {
            callback(null, data.power === "On")
        }).catch(() => {
            callback(null, false)
        })
    };
    getVolumeState = (callback) => {
        this.request("audio/volume").then((data) => {
            this.volume = {
                ...this.volume,
                ...data
            };
            const volume = Math.floor(((this.volume.current - this.volume.min) / (this.volume.max - this.volume.min)) * 100);
            callback(null, volume)
        })
    };

    setVolumeState = (value, callback) => {
        this.volume.current = Math.round(this.volume.min + (this.volume.max - this.volume.min) * (value / 100));
        this.request("audio/volume",this.volume);
        callback(null, value);
    };

    setMuteState = (value, callback) => {
        this.volume.muted = !value;
        this.request("audio/volume",this.volume);
        callback(null, value);
    };

    setAmbilightState = (value, callback) => {
        if (value) {
            this.request("ambilight/currentconfiguration", {
                styleName: "FOLLOW_VIDEO",
                isExpert: false,
                menuSetting: "NATURAL"
            }).then((data) => {
                callback(null, true)
            })
        } else {
            this.request("ambilight/power", {
                power: "Off"
            }).then((data) => {
                callback(null, false)
            })
        }

    }


}

module.exports = PhilipsTV;
