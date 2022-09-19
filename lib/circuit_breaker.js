const BaseAccessory = require('./base_accessory')

let Accessory;
let Service;
let Characteristic;
let UUIDGen;

const DEFAULT_LEVEL_COUNT = 3;
class CircuitBreakerAccessory extends BaseAccessory {
  constructor(platform, homebridgeAccessory, deviceConfig) {

    ({ Accessory, Characteristic, Service } = platform.api.hap);
    super(
      platform,
      homebridgeAccessory,
      deviceConfig,
      Accessory.Categories.AIR_HEATER,
      Service.HeaterCooler
    );
    this.statusArr = deviceConfig.status;
    this.functionArr = deviceConfig.functions ? deviceConfig.functions : [];

    Characteristic.CustomAmperes = function() {
      Characteristic.call(this, 'Amperes', 'E863F126-079E-48FF-8F27-9C2605A29F52');
      this.setProps({
        format: Characteristic.Formats.FLOAT,
        unit: 'A',
        minValue: 0,
        maxValue: 65535,
        minStep: 0.01,
        perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
      });
      this.value = 0;
    };
    inherits(Characteristic.CustomAmperes, Characteristic);
    Characteristic.CustomAmperes.UUID = 'E863F126-079E-48FF-8F27-9C2605A29F52';

    Characteristic.CustomKilowattHours = function() {
      Characteristic.call(this, 'Total Consumption', 'E863F10C-079E-48FF-8F27-9C2605A29F52');
      this.setProps({
        format: Characteristic.Formats.FLOAT,
        unit: 'kWh',
        minValue: 0,
        maxValue: 65535,
        minStep: 0.001,
        perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
      });
      this.value = 0;
    };
    inherits(Characteristic.CustomKilowattHours, Characteristic);
    Characteristic.CustomKilowattHours.UUID = 'E863F10C-079E-48FF-8F27-9C2605A29F52';

    Characteristic.CustomVolts = function() {
      Characteristic.call(this, 'Volts', 'E863F10A-079E-48FF-8F27-9C2605A29F52');
      this.setProps({
        format: Characteristic.Formats.FLOAT,
        unit: 'V',
        minValue: 0,
        maxValue: 65535,
        minStep: 0.1,
        perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
      });
      this.value = 0;
    };
    inherits(Characteristic.CustomVolts, Characteristic);
    Characteristic.CustomVolts.UUID = 'E863F10A-079E-48FF-8F27-9C2605A29F52';

    Characteristic.CustomWatts = function() {
      Characteristic.call(this, 'Consumption', 'E863F10D-079E-48FF-8F27-9C2605A29F52');
      this.setProps({
        format: Characteristic.Formats.FLOAT,
        unit: 'W',
        minValue: 0,
        maxValue: 65535,
        minStep: 0.1,
        perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
      });
      this.value = 0;
    };
    inherits(Characteristic.CustomWatts, Characteristic);
    Characteristic.CustomWatts.UUID = 'E863F10D-079E-48FF-8F27-9C2605A29F52';

    this.refreshAccessoryServiceIfNeed(this.statusArr, false);
  }

  //init Or refresh AccessoryService
  refreshAccessoryServiceIfNeed(statusArr, isRefresh) {
    this.isRefresh = isRefresh;
    for (var statusMap of statusArr) {
      if (statusMap.code === 'switch') {
        this.switchMap = statusMap
        const hbSwitch = this.tuyaParamToHomeBridge(Characteristic.Active, this.switchMap);
        this.normalAsync(Characteristic.Active, hbSwitch)
        this.normalAsync(Characteristic.CurrentHeaterCoolerState, 2)
        this.normalAsync(Characteristic.TargetHeaterCoolerState, 1, {
          minValue: 1,
          maxValue: 1,
          validValues: [Characteristic.TargetHeaterCoolerState.HEAT]
        })
      }
      if (statusMap.code === 'temp_current' || statusMap.code === 'temp_current_f') {
        this.temperatureMap = statusMap
        this.normalAsync(Characteristic.CurrentTemperature, this.temperatureMap.value, {
          minValue: -20,
          maxValue: 122,
          minStep: 1
        })

        const hbUnits = this.tuyaParamToHomeBridge(Characteristic.TemperatureDisplayUnits, this.temperatureMap);
        this.normalAsync(Characteristic.TemperatureDisplayUnits, hbUnits, {
          minValue: hbUnits,
          maxValue: hbUnits,
          validValues: [hbUnits]
        })
      }
      if (statusMap.code === 'lock') {
        this.lockMap = statusMap
        const hbLock = this.tuyaParamToHomeBridge(Characteristic.LockPhysicalControls, this.lockMap);
        this.normalAsync(Characteristic.LockPhysicalControls, hbLock)
      }
      if (statusMap.code === 'level') {
        this.speedMap = statusMap;
        const hbSpeed = this.tuyaParamToHomeBridge(Characteristic.RotationSpeed, this.speedMap);
        this.normalAsync(Characteristic.RotationSpeed, hbSpeed)
      }
      if (statusMap.code === 'shake') {
        this.shakeMap = statusMap
        const hbShake = this.tuyaParamToHomeBridge(Characteristic.SwingMode, this.shakeMap);
        this.normalAsync(Characteristic.SwingMode, hbShake)
      }
      if (statusMap.code === 'temp_set' || statusMap.code === 'temp_set_f') {
        this.tempsetMap = statusMap

        if (!this.temp_set_range) {
          if (statusMap.code === 'temp_set') {
            this.temp_set_range = { 'min': 0, 'max': 50 }
          } else {
            this.temp_set_range = { 'min': 32, 'max': 104 }
          }
        }
        this.normalAsync(Characteristic.HeatingThresholdTemperature, this.tempsetMap.value, {
          minValue: this.temp_set_range.min,
          maxValue: this.temp_set_range.max,
          minStep: 1
        })
      }
    }
  }

  normalAsync(name, hbValue, props) {
    this.setCachedState(name, hbValue);
    if (this.isRefresh) {
      this.service
        .getCharacteristic(name)
        .updateValue(hbValue);
    } else {
      this.getAccessoryCharacteristic(name, props);
    }
  }

  getAccessoryCharacteristic(name, props) {
    //set  Accessory service Characteristic
    this.service.getCharacteristic(name)
      .setProps(props || {})
      .on('get', callback => {
        if (this.hasValidCache()) {
          callback(null, this.getCachedState(name));
        }
      })
      .on('set', (value, callback) => {
        if (name == Characteristic.TargetHeaterCoolerState || name == Characteristic.TemperatureDisplayUnits) {
          callback();
          return;
        }
        var param = this.getSendParam(name, value)
        this.platform.tuyaOpenApi.sendCommand(this.deviceId, param).then(() => {
          this.setCachedState(name, value);
          callback();
        }).catch((error) => {
          this.log.error('[SET][%s] Characteristic.Brightness Error: %s', this.homebridgeAccessory.displayName, error);
          this.invalidateCache();
          callback(error);
        });
      });
  }

  //get Command SendData
  getSendParam(name, value) {
    var code;
    var value;
    switch (name) {
      case Characteristic.Active:
        const isOn = value ? true : false;
        code = "switch";
        value = isOn;
        break;
      case Characteristic.LockPhysicalControls:
        const isLock = value ? true : false;
        code = "lock";
        value = isLock;
        break;
      case Characteristic.RotationSpeed: {
        let level = Math.floor(value / this.speed_coefficient) + 1
        level = level > this.level_count ? this.level_count : level;
        code = this.speedMap.code
        value = "" + level;
      }
        break;
      case Characteristic.SwingMode:
        const isSwing = value ? true : false;
        code = "shake";
        value = isSwing;
        break;
      case Characteristic.HeatingThresholdTemperature:
        const tempset = value;
        code = this.tempsetMap.code;
        value = tempset;
        break;
      default:
        break;
    }
    return {
      "commands": [
        {
          "code": code,
          "value": value
        }
      ]
    };
  }


  tuyaParamToHomeBridge(name, param) {
    switch (name) {
      case Characteristic.Active:
      case Characteristic.LockPhysicalControls:
      case Characteristic.SwingMode:
        let status
        if (param.value) {
          status = 1
        } else {
          status = 0
        }
        return status
      case Characteristic.TemperatureDisplayUnits:
        let units
        if (param.code === 'temp_current') {
          units = 0
        } else {
          units = 1
        }
        return units
      case Characteristic.RotationSpeed:
        let speed
        speed = parseInt(param.value * this.speed_coefficient);
        return speed
    }
  }

  getLevelFunction(code) {
    if (this.functionArr.length == 0) {
      return DEFAULT_LEVEL_COUNT;
    }
    var funcDic = this.functionArr.find((item, index) => { return item.code == code })
    if (funcDic) {
      let value = JSON.parse(funcDic.values)
      let isnull = (JSON.stringify(value) == "{}")
      return isnull ? DEFAULT_LEVEL_COUNT : value.range.length;
    } else {
      return DEFAULT_LEVEL_COUNT;
    }
  }

  getTempSetDPRange() {
    if (this.functionArr.length == 0) {
      return;
    }
    let tempSetRange
    for (const funcDic of this.functionArr) {
      let valueRange = JSON.parse(funcDic.values)
      let isnull = (JSON.stringify(valueRange) == "{}")
      switch (funcDic.code) {
        case 'temp_set':
          tempSetRange = isnull ? { 'min': 0, 'max': 50 } : { 'min': parseInt(valueRange.min), 'max': parseInt(valueRange.max) }
          break;
        case 'temp_set_f':
          tempSetRange = isnull ? { 'min': 32, 'max': 104 } : { 'min': parseInt(valueRange.min), 'max': parseInt(valueRange.max) }
          break;
        default:
          break;
      }
    }
    return tempSetRange
  }

  //update device status
  updateState(data) {
    this.refreshAccessoryServiceIfNeed(data.status, true);
  }
}

module.exports = CircuitBreakerAccessory;



// const inherits = require("util").inherits,
// 	moment = require('moment'),
// 	ModbusRTU = require("modbus-serial"),
// 	dns = require("dns");

// var client = new ModbusRTU();

// var Service, Characteristic, Accessory, FakeGatoHistoryService;

// module.exports = function(homebridge) {
// 	Service = homebridge.hap.Service;
// 	Characteristic = homebridge.hap.Characteristic;
// 	Accessory = homebridge.hap.Accessory;

// 	FakeGatoHistoryService = require('fakegato-history')(homebridge);

// 	homebridge.registerAccessory("homebridge-sma-inverter", "SMAInverter", SMAInverter);
// };

// function SMAInverter(log, config) {
// 	this.log = log;
// 	this.name = config["name"] || "SMA Solar Inverter";
// 	this.hostname = config["hostname"];
// 	this.refreshInterval = (config['refreshInterval'] * 1000) || 60000;
// 	this.debug = config["debug"] || false;

// 	this.value = [];
// 	this.value.Name = config["name"] || '';
// 	this.value.Manufacturer = "";
// 	this.value.Model = "";
// 	this.value.FirmwareRevision = "1.0.0";
// 	this.value.SerialNumber = "";

// 	Characteristic.CustomAmperes = function() {
// 		Characteristic.call(this, 'Amperes', 'E863F126-079E-48FF-8F27-9C2605A29F52');
// 		this.setProps({
// 			format: Characteristic.Formats.FLOAT,
// 			unit: 'A',
// 			minValue: 0,
// 			maxValue: 65535,
// 			minStep: 0.01,
// 			perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
// 		});
// 		this.value = 0;
// 	};
// 	inherits(Characteristic.CustomAmperes, Characteristic);
// 	Characteristic.CustomAmperes.UUID = 'E863F126-079E-48FF-8F27-9C2605A29F52';

// 	Characteristic.CustomKilowattHours = function() {
// 		Characteristic.call(this, 'Total Consumption', 'E863F10C-079E-48FF-8F27-9C2605A29F52');
// 		this.setProps({
// 			format: Characteristic.Formats.FLOAT,
// 			unit: 'kWh',
// 			minValue: 0,
// 			maxValue: 65535,
// 			minStep: 0.001,
// 			perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
// 		});
// 		this.value = 0;
// 	};
// 	inherits(Characteristic.CustomKilowattHours, Characteristic);
// 	Characteristic.CustomKilowattHours.UUID = 'E863F10C-079E-48FF-8F27-9C2605A29F52';

// 	Characteristic.CustomVolts = function() {
// 		Characteristic.call(this, 'Volts', 'E863F10A-079E-48FF-8F27-9C2605A29F52');
// 		this.setProps({
// 			format: Characteristic.Formats.FLOAT,
// 			unit: 'V',
// 			minValue: 0,
// 			maxValue: 65535,
// 			minStep: 0.1,
// 			perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
// 		});
// 		this.value = 0;
// 	};
// 	inherits(Characteristic.CustomVolts, Characteristic);
// 	Characteristic.CustomVolts.UUID = 'E863F10A-079E-48FF-8F27-9C2605A29F52';

// 	Characteristic.CustomWatts = function() {
// 		Characteristic.call(this, 'Consumption', 'E863F10D-079E-48FF-8F27-9C2605A29F52');
// 		this.setProps({
// 			format: Characteristic.Formats.FLOAT,
// 			unit: 'W',
// 			minValue: 0,
// 			maxValue: 65535,
// 			minStep: 0.1,
// 			perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
// 		});
// 		this.value = 0;
// 	};
// 	inherits(Characteristic.CustomWatts, Characteristic);
// 	Characteristic.CustomWatts.UUID = 'E863F10D-079E-48FF-8F27-9C2605A29F52';

// 	// Start the connection and refresh cycles
// 	this._connect();

// 	// Set the automatic refresh onload only
// 	setInterval(function() {
// 		this._refresh();
// 	}.bind(this), this.refreshInterval);
// }

// SMAInverter.prototype = {

// 	identify: function(callback) {
// 		this.log("identify");
// 		callback();
// 	},

// 	_connect: function(isInitial) {
// 		if(this.debug) {this.log("Attempting connection", this.hostname);}

// 		// Get the hostname from dns - note: IPv4 support only for currently, have not tested IPv6
// 		try {
// 			dns.resolve(this.hostname, "A", function (err, addresses, family) {
// 				// Connect to the ModBus server hostname
// 				if(!err) {client.connectTCP(addresses[0]);}
// 				else {client.connectTCP(this.hostname);}
// 			}.bind(this));
// 		}
// 		catch(err) {
// 			this.log("Failed to resolve DNS hostname - maybe this is an IP address?", err);

// 			// Connect to the ModBus server IP address
// 			try {client.connectTCP(this.hostname);}
// 			catch(err) {this.log("Connection attempt failed");}
// 		}

// 		try {
// 			// Set the ModBus Id to use
// 			client.setID(3);

// 			if(this.debug) {this.log("Connection successful");}
// 		}
// 		catch(err) {this.log("Could not set the Channel Number");}
// 	},

// 	_refresh: function() {
// 		// Obtain the values
// 		try {
// 			/*
// 			// Manufacturer
// 			client.readHoldingRegisters(30051, 10, function(err, data) {
// 				switch(data.buffer.readUInt32BE()) {
// 					case "8001": this.value.Manufacturer = "SMA Solar Inverter"; break;
// 					default: this.value.Manufacturer = "Unknown"; break;
// 				}
// 			}.bind(this));

// 			// Model
// 			client.readHoldingRegisters(30053, 10, function(err, data) {
// 				switch(data.buffer.readUInt32BE()) {
// 					case "9319" : this.value.Model = "Sunny Boy 3.0"; break;
// 					case "9320" : this.value.Model = "Sunny Boy 3.6"; break;
// 					case "9321" : this.value.Model = "Sunny Boy 4.0"; break;
// 					case "9322" : this.value.Model = "Sunny Boy 5.0"; break;
// 					default: this.value.Model = "Sunny Boy"; break;
// 				}
// 			}.bind(this));

// 			// Serial Number
// 			client.readHoldingRegisters(30057, 10, function(err, data) {this.value.SerialNumber = data.buffer.readUInt32BE();}.bind(this));
// 			*/

// 			// Currently - Light Sensor
// 			client.readHoldingRegisters(30775, 10, function(err, data) {
// 				// Check if the value is unrealistic (the inverter is not generating)
// 				if(data.buffer.readUInt32BE() > 0 && data.buffer.readUInt32BE() <= (65535*1000) && typeof data.buffer.readUInt32BE() == 'number' && Number.isFinite(data.buffer.readUInt32BE())) {
// 					this.lightSensorCurrently.getCharacteristic(Characteristic.CurrentAmbientLightLevel).updateValue(data.buffer.readUInt32BE() / 1000);

// 					// Eve - Watts
// 					this.lightSensorCurrently.getCharacteristic(Characteristic.CustomWatts).updateValue(data.buffer.readUInt32BE());
// 					this.loggingService.addEntry({time: moment().unix(), power: data.buffer.readUInt32BE()});

// 					if(data.buffer.readUInt32BE() > 0) {
// 						if(this.debug) {this.log("Device status", "On");}
						
// 						// Today - Light Sensor
// 						client.readHoldingRegisters(30535, 10, function(err, data) {
// 							if(data.buffer.readUInt32BE() > 0 && data.buffer.readUInt32BE() <= (65535*1000) && typeof data.buffer.readUInt32BE() == 'number' && Number.isFinite(data.buffer.readUInt32BE())) {
// 								this.lightSensorToday.getCharacteristic(Characteristic.CurrentAmbientLightLevel).updateValue(data.buffer.readUInt32BE() / 1000);
// 							}
// 						}.bind(this));

// 						// All Time - Light Sensor
// 						client.readHoldingRegisters(30529, 10, function(err, data) {
// 							if(data.buffer.readUInt32BE() > 0 && data.buffer.readUInt32BE() <= (65535*1000) && typeof data.buffer.readUInt32BE() == 'number' && Number.isFinite(data.buffer.readUInt32BE())) {
// 								this.lightSensorCurrently.getCharacteristic(Characteristic.CustomKilowattHours).updateValue(data.buffer.readUInt32BE() / 1000);
// 								this.lightSensorTotal.getCharacteristic(Characteristic.CurrentAmbientLightLevel).updateValue(data.buffer.readUInt32BE() / 1000);
// 							}
// 						}.bind(this));

// 						// Amperes - FakeGato
// 						client.readHoldingRegisters(30977, 10, function(err, data) {
// 							if(data.buffer.readUInt32BE() > 0 && data.buffer.readUInt32BE() <= (65535*1000) && typeof data.buffer.readUInt32BE() == 'number' && Number.isFinite(data.buffer.readUInt32BE())) {
// 								this.lightSensorCurrently.getCharacteristic(Characteristic.CustomAmperes).updateValue(data.buffer.readUInt32BE() / 1000);
// 							}
// 						}.bind(this));

// 						// Volts - FakeGato
// 						client.readHoldingRegisters(30783, 10, function(err, data) {
// 							if(data.buffer.readUInt32BE() > 0 && data.buffer.readUInt32BE() <= (65535*100) && typeof data.buffer.readUInt32BE() == 'number' && Number.isFinite(data.buffer.readUInt32BE())) {
// 								this.lightSensorCurrently.getCharacteristic(Characteristic.CustomVolts).updateValue(data.buffer.readUInt32BE() / 100);
// 							}
// 						}.bind(this));
// 					}
// 					else if (this.debug) {this.log("Device status", "Off - low value");}
// 				}
// 				else {
// 					if(this.debug) {this.log("Device status", "Off - unreasonable value");}
// 					this.lightSensorCurrently.getCharacteristic(Characteristic.CurrentAmbientLightLevel).updateValue(0.0001);
// 				}
// 			}.bind(this));
// 		}
// 		catch(err) {
// 			this.log("Refresh failed", "Attempting reconnect...", err);

// 			// Attempt to reconnect
// 			this._connect();
// 		}
// 	},

// 	getServices: function() {
// 		this.lightSensorCurrently = new Service.LightSensor(this.name + " Currently", "currently");
// 		this.lightSensorCurrently.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
// 			.setProps({
// 				unit: "kWh",
// 				minValue: 0,
// 				maxValue: 100000,
// 				minStep: 0.0001
// 			});
// 		this.lightSensorCurrently.addCharacteristic(Characteristic.CustomAmperes);
// 		this.lightSensorCurrently.addCharacteristic(Characteristic.CustomKilowattHours);
// 		this.lightSensorCurrently.addCharacteristic(Characteristic.CustomVolts);
// 		this.lightSensorCurrently.addCharacteristic(Characteristic.CustomWatts);

// 		this.lightSensorToday = new Service.LightSensor(this.name + " Today", "today");
// 		this.lightSensorToday.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
// 			.setProps({
// 				unit: "kWh",
// 				minValue: 0,
// 				maxValue: 100000,
// 				minStep: 0.0001
// 			});

// 		this.lightSensorTotal = new Service.LightSensor(this.name + " Total", "total");
// 		this.lightSensorTotal.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
// 			.setProps({
// 				unit: "kWh",
// 				minValue: 0,
// 				maxValue: 100000,
// 				minStep: 0.0001
// 			});

// 		this.loggingService = new FakeGatoHistoryService("energy", Accessory);

// 		this.informationService = new Service.AccessoryInformation();
// 		this.informationService
// 			.setCharacteristic(Characteristic.Name, this.value.Name)
// 			.setCharacteristic(Characteristic.Manufacturer, this.value.Manufacturer)
// 			.setCharacteristic(Characteristic.Model, this.value.Model)
// 			.setCharacteristic(Characteristic.SerialNumber, this.value.SerialNumber);

// 		return [
// 			this.lightSensorCurrently,
// 			this.lightSensorToday,
// 			this.lightSensorTotal,
// 			this.loggingService,
// 			this.informationService
// 		];
// 	},

// 	_getValue: function(CharacteristicName, callback) {
// 		if(this.debug) {this.log("GET", CharacteristicName);}
// 		callback(null);
// 	},

// 	_setValue: function(CharacteristicName, value, callback) {
// 		// This does nothing if the user tries to turn it on / off as we cannot action anything on the device
// 		if(this.debug) {this.log("SET", CharacteristicName);}
// 		callback(null, true);
// 	}

// };