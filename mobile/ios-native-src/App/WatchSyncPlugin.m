//  WatchSyncPlugin.m
//  TEAM 3332 — registers the WatchSync plugin with Capacitor (Apple Watch support, session 17)
//
//  Capacitor discovers plugins at runtime through these ObjC macros. The JS name here
//  ("WatchSync") is what app.jsx passes to registerPlugin('WatchSync'). Add to the `App` target.

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(WatchSyncPlugin, "WatchSync",
    CAP_PLUGIN_METHOD(isSupported,  CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setContext,   CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(drainPending, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(confirmSync,  CAPPluginReturnPromise);
)
