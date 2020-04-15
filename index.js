'use strict';
const pkg = require('./package.json');
const PhilipsTV = require('./PhilipsTV.js');

const pluginName = pkg.name;
const accessoryName = 'PhilipsTV';
let Service, Characteristic;

class PhilipsTvAccessory {

    state = {
        power: true,
        ambilight: true,
        source: 0,
        volume: 0,
    };

    config = {};
    services = [];
    tvService = null;

    constructor(log, config) {
        this.config = {...this.config, ...config};
        this.PhilipsTV = new PhilipsTV(config);

        this.registerAccessoryInformationService();
        this.registerTelevisionService();
        this.registerInputService();
        this.registerAmbilightService();
        this.registerVolumeService();

    }

    identify(callback) {
        callback(); // success
    };

    registerAccessoryInformationService = () => {
        const {name, model_year} = this.config;
        const {Name, Manufacturer, Model, FirmwareRevision} = Characteristic;

        const infoService = new Service.AccessoryInformation();
        infoService
            .setCharacteristic(Name, name)
            .setCharacteristic(Manufacturer, pkg.author)
            .setCharacteristic(Model, "Year " + model_year)
            .setCharacteristic(FirmwareRevision, pkg.version);
        this.services.push(infoService);
    };


    registerTelevisionService = () => {

        const {name, poll_status_interval} = this.config;
        const {ConfiguredName, SleepDiscoveryMode, Active} = Characteristic;
        const tvService = new Service.Television(name, "Television");
        const power = tvService.getCharacteristic(Active);

        tvService.setCharacteristic(ConfiguredName, name);
        tvService.setCharacteristic(SleepDiscoveryMode, SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

        power.on('get', this.PhilipsTV.getPowerState);
        power.on('set', (value, callback) => {
            this.state.power = value;
            this.PhilipsTV.setPowerState(value, callback)
        });

        if (poll_status_interval) {
            setInterval(() => {
                this.PhilipsTV.getPowerState((err, value) => {
                    if (this.state.power !== value) {
                        this.state.power = value;
                        power.updateValue(value)
                    }
                })
            }, poll_status_interval * 1000);
        }

        this.tvService = tvService;
        this.services.push(tvService);
    };

    registerInputService = () => {
        const {inputs} = this.config;
        const {ActiveIdentifier} = Characteristic;

        this.tvService.setCharacteristic(ActiveIdentifier, 1);
        this.tvService.getCharacteristic(ActiveIdentifier)
            .on('get', callback => {
                this.PhilipsTV.getCurrentSource(inputs).then((source) => {
                    this.state.source = source;
                    callback(null, this.state.source)
                });
            })
            .on('set', (value, callback) => {
                this.state.source = value;
                const input = inputs[value];
                this.PhilipsTV.setSource(input, callback);
            });

        inputs.forEach((item, index) => {
            const input = this.createInputSource(item.name, item.name, index);
            this.tvService.addLinkedService(input);
            this.services.push(input);
        });

    };

    registerAmbilightService = () => {
        const {name, has_ambilight, poll_status_interval} = this.config;

        if (has_ambilight) {
            this.ambilightService = new Service.Lightbulb(name + " Ambilight", "tvAmbilight");
            const ambilightPower = this.ambilightService.getCharacteristic(Characteristic.On);
            ambilightPower
                .on('get', this.PhilipsTV.getAmbilightState)
                .on('set', (value, callback) => {
                    this.state.ambilight = value;
                    this.PhilipsTV.setAmbilightState(value, callback)
                });
            this.services.push(this.ambilightService);

            if (poll_status_interval) {
                setInterval(() => {
                    this.PhilipsTV.getAmbilightState((err, value) => {
                        if (this.state.ambilight !== value) {
                            this.state.ambilight = value;
                            ambilightPower.updateValue(value)
                        }
                    })
                }, poll_status_interval * 1000);
            }
        }
    };

    registerVolumeService = () => {
        const {name, poll_status_interval} = this.config;

        this.volumeService = new Service.Lightbulb(name + " Volume", "tvVolume");
        this.volumeService
            .getCharacteristic(Characteristic.On)
            .on('get', (callback) => {
                callback(null, 1)
            })
            .on('set', (value, callback) => {
                this.PhilipsTV.setMuteState(value, callback)
            });
        const volumeLevel = this.volumeService
            .getCharacteristic(Characteristic.Brightness);
        volumeLevel
            .on('get', this.PhilipsTV.getVolumeState)
            .on('set', (value, callback) => {
                this.state.volume = value;
                this.PhilipsTV.setVolumeState(value, callback)
            });
        if (poll_status_interval) {
            setInterval(() => {
                this.PhilipsTV.getVolumeState((err, value) => {
                    if (this.state.volume !== value) {
                        this.state.volume = value;
                        volumeLevel.updateValue(value)
                    }
                })
            }, poll_status_interval * 1000);
        }
        this.services.push(this.volumeService);

    };

    createInputSource(id, name, number, type = Characteristic.InputSourceType.TV) {
        const {Identifier, ConfiguredName, IsConfigured, InputSourceType} = Characteristic;
        const input = new Service.InputSource(id, name);
        input.setCharacteristic(Identifier, number)
            .setCharacteristic(ConfiguredName, name)
            .setCharacteristic(IsConfigured, IsConfigured.CONFIGURED)
            .setCharacteristic(InputSourceType, type);
        return input;
    }

    getServices() {

        return this.services;
    }
}


module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory(pluginName, accessoryName, PhilipsTvAccessory);
};
