//  HeartRatePlugin.m
//  TEAM 3332 — registers the HeartRate plugin with Capacitor (623)
//
//  Capacitor discovers plugins at runtime through these ObjC macros. The JS name here
//  ("HeartRate") is what app.jsx passes to Capacitor.registerPlugin('HeartRate').
//  Add this file to the main `App` target.

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(HeartRatePlugin, "HeartRate",
    CAP_PLUGIN_METHOD(startScan,  CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stopScan,   CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(connect,    CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(disconnect, CAPPluginReturnPromise);
)
