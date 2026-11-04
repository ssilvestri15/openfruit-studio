module.exports = `// !$*UTF8*$!
{
 archiveVersion = 1;
 classes = {};
 objectVersion = 77;
 objects = {
  PROJECT = { isa = PBXProject; buildConfigurationList = PROJECT_LIST; mainGroup = GROUP; targets = (APP, WIDGET,); packageReferences = (PACKAGE,); };
  GROUP = { isa = PBXGroup; children = (SOURCE, SYNCED,); sourceTree = "<group>"; };
  PROJECT_LIST = { isa = XCConfigurationList; buildConfigurations = (PROJECT_DEBUG, PROJECT_RELEASE,); };
  PROJECT_DEBUG = { isa = XCBuildConfiguration; name = Debug; buildSettings = { DEVELOPMENT_TEAM = PROJECT001; IPHONEOS_DEPLOYMENT_TARGET = 16.0; }; };
  PROJECT_RELEASE = { isa = XCBuildConfiguration; name = Release; buildSettings = { DEVELOPMENT_TEAM = PROJECT001; }; };
  APP = { isa = PBXNativeTarget; name = Demo; buildConfigurationList = APP_LIST; buildPhases = (SOURCES, FRAMEWORKS, SCRIPT,); dependencies = (DEPENDENCY,); packageProductDependencies = (PRODUCT,); productType = "com.apple.product-type.application"; };
  APP_LIST = { isa = XCConfigurationList; buildConfigurations = (APP_DEBUG, APP_RELEASE,); };
  APP_DEBUG = { isa = XCBuildConfiguration; name = Debug; baseConfigurationReference = XCCONFIG; buildSettings = {
    PRODUCT_BUNDLE_IDENTIFIER /* Keep bundle comment */ = com.example.demo.debug;
    DEVELOPMENT_TEAM = APPTEAM001;
    PRODUCT_NAME = "$(TARGET_NAME)";
    OTHER_SWIFT_FLAGS = ("$(inherited)", "-DDEBUG",);
    "CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "Apple Development";
  }; };
  APP_RELEASE = { isa = XCBuildConfiguration; name = Release; buildSettings = { PRODUCT_BUNDLE_IDENTIFIER = com.example.demo; }; };
  WIDGET = { isa = PBXNativeTarget; name = Widget; buildConfigurationList = WIDGET_LIST; buildPhases = (); dependencies = (); };
  WIDGET_LIST = { isa = XCConfigurationList; buildConfigurations = (WIDGET_DEBUG,); };
  WIDGET_DEBUG = { isa = XCBuildConfiguration; name = Debug; buildSettings = { PRODUCT_BUNDLE_IDENTIFIER = com.example.demo.widget; }; };
  SOURCES = { isa = PBXSourcesBuildPhase; files = (SOURCE_BUILD,); };
  FRAMEWORKS = { isa = PBXFrameworksBuildPhase; files = (PACKAGE_BUILD,); };
  SOURCE_BUILD = { isa = PBXBuildFile; fileRef = SOURCE; };
  SOURCE = { isa = PBXFileReference; path = Source.swift; sourceTree = "<group>"; };
  XCCONFIG = { isa = PBXFileReference; path = Config/Debug.xcconfig; sourceTree = "<group>"; };
  DEPENDENCY = { isa = PBXTargetDependency; target = WIDGET; };
  PACKAGE_BUILD = { isa = PBXBuildFile; productRef = PRODUCT; };
  PRODUCT = { isa = XCSwiftPackageProductDependency; productName = Collections; package = PACKAGE; };
  PACKAGE = { isa = XCRemoteSwiftPackageReference; repositoryURL = "https://github.com/apple/swift-collections.git"; requirement = { kind = upToNextMajorVersion; minimumVersion = 1.1.0; }; };
  SYNCED = { isa = PBXFileSystemSynchronizedRootGroup; path = Sources; exceptions = (); sourceTree = "<group>"; };
  /* Preserve this whole future object byte-for-byte. */
  FUTURE = { isa = PBXFutureType; payload = <00 ff 12 ab>; unknown = { words = ("caffè", "\\U00e8", "slash\\\\quote\\\"",); }; };
  SCRIPT = { isa = PBXShellScriptBuildPhase; name = "Custom script"; files = (); shellScript = "echo \\\"hello\\\"\\n"; };
 };
 rootObject = PROJECT;
}
`;
