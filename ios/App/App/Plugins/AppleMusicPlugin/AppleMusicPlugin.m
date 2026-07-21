#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(AppleMusicPlugin, "AppleMusic",
           CAP_PLUGIN_METHOD(authorize, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(createPlaylist, CAPPluginReturnPromise);
)
