load('api_config.js');
load('api_events.js');
load('api_gpio.js');
load('api_http.js');
load('api_net.js');
load('api_sys.js');
load('api_timer.js');
load('api_esp32.js');
load('api_dht.js');
load('api_adc.js');
load('api_rpc.js');

// Pins
let resetPin = 0;
let statusLightPin = 16;
let dhtPin = 22;
let moisturePin = 32;

// Turn on status led
GPIO.set_mode(statusLightPin, GPIO.MODE_OUTPUT);
GPIO.write(statusLightPin, 0);

// Reset Handler
GPIO.set_mode(resetPin, GPIO.MODE_INPUT);
GPIO.set_int_handler(resetPin, GPIO.INT_EDGE_NEG, function(resetPin) {
  print('Pin', resetPin, 'got interrupt');
  for (let i=0; i<=5; i++)
  {
    GPIO.toggle(statusLightPin);
    Sys.usleep(200000);
  }
  GPIO.write(statusLightPin, 1);
  
  // enable bluetooth
  //Cfg.set({bt:{enable:false}});
  // disable and clear wifi-config
  //Cfg.set({wifi:{sta:{enable:false}}});
  //Cfg.set({wifi:{ap:{enable:false}}});
  //Cfg.set({wifi:{sta:{ssid:'',pass:''}}});

  Sys.reboot(1000);
}, null);

print("Starting...");

GPIO.enable_int(resetPin);
ADC.enable(moisturePin);

let dht = DHT.create(dhtPin, DHT.DHT11);
let deviceId = Cfg.get("device.id");
if (deviceId === "")
{
  deviceId = Cfg.get("higrow.deviceId");
  Cfg.set("device.id", deviceId);
}

let connected = false;
let readSensors = Timer.set(5000, Timer.REPEAT, function() {
  let t = dht.getTemp();
  let h = dht.getHumidity();
  let m = ADC.read(moisturePin);

  print("DeviceId:",deviceId,"Temperature:",t,"Humidity:",h,"Moisture:",m);
  
  if (deviceId !== "" && connected)
  {
    GPIO.write(statusLightPin, 0);
    let jsonData = {'deviceId': deviceId, 'temperature': t, 'humidity': h, 'moisture': m, timestamp: {".sv": "timestamp"}};
    HTTP.query({
      headers: {'Content-Type' : 'application/json'},
      url: 'https://highgrow-3e3c9.firebaseio.com/record/entry.json',  // replace with your own endpoint
      data: jsonData,
      success: function(body, full_http_msg) 
      { 
        //print(body); 
        // sleep for 15 seconds, then (re)boot up and do it all over again
        //ESP32.deepSleep(15000000); // 15 seconds 
      },
      error: function(err) 
      { 
        print(err); 
        //ESP32.deepSleep(30000000); // 30 seconds
      },
    });

    GPIO.write(statusLightPin, 1);
    //Timer.del(readSensors);
  }
  else
  {
    print("DeviceId:",deviceId,"Connected:",connected);
    GPIO.write(statusLightPin, 1);
  }

}, null);

// RPC Handlers
RPC.addHandler('HG.Temp.Read', function(args){
  return { value: dht.getTemp() };
});
RPC.addHandler('HG.Humidity.Read', function(args){
  return { value: dht.getHumidity() };
});
RPC.addHandler('HG.Moisture.Read', function(args){
  return { value: ADC.read(moisturePin) };
});
RPC.addHandler('HG.StatusLED.Read', function(args){
  return { value: GPIO.read(statusLightPin) };
});
RPC.addHandler('HG.StatusLED.On', function(args){
  GPIO.write(statusLightPin, 0);
  print("LED On");
  if (GPIO.read(statusLightPin) !== 0)
  {
    return false;
  }
  
  return true;
});
RPC.addHandler('HG.StatusLED.Off', function(args){
  GPIO.write(statusLightPin, 1);
  if (GPIO.read(statusLightPin) !== 1)
  {
    return false;
  }
  
  return true;
});


// Monitor network connectivity.
Event.addGroupHandler(Net.EVENT_GRP, function(ev, evdata, arg) {
  let status = true && connected;
  let evs = '???';
  if (ev === Net.STATUS_DISCONNECTED) {
    evs = 'DISCONNECTED';
    connected = false;
  } else if (ev === Net.STATUS_CONNECTING) {
    evs = 'CONNECTING';
    connected = false;
  } else if (ev === Net.STATUS_CONNECTED) {
    evs = 'CONNECTED';
    connected = false;
  } else if (ev === Net.STATUS_GOT_IP) {
    evs = 'GOT_IP';
    connected = true;
  }
  
  print(evs);
}, null);
