//  LiveActivityPlugin.m
//  TEAM 3332 — registers the LiveActivity plugin with Capacitor (618g)
//
//  Capacitor discovers plugins at runtime through these ObjC macros. The JS name here
//  ("LiveActivity") is what app.jsx passes to Capacitor.registerPlugin('LiveActivity').
//  Add this file to the main `App` target.

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(LiveActivityPlugin, "LiveActivity",
    CAP_PLUGIN_METHOD(start,       CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(update,      CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(end,         CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(isSupported, CAPPluginReturnPromise);
)
