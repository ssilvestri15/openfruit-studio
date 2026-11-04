import { useTranslation } from '../localization';
import React, { useState } from 'react';
import { 
  Play, Bug, Smartphone, ChevronDown, PanelLeftClose, PanelLeft, 
  PanelRightClose, PanelRight, PanelBottomClose, PanelBottom,
  GitBranch, Loader2, Minus, Square, X 
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { OpenFruitDevice } from '../types';

interface TopBarProps {
  projectName: string;
  onOpenProjectSettings: () => void;
  isFileMenuOpen: boolean;
  onToggleFileMenu: () => void;
  onToggleGitDrawer: () => void;
  isLeftPanelOpen: boolean;
  onToggleLeftPanel: () => void;
  isRightPanelOpen: boolean;
  onToggleRightPanel: () => void;
  isBottomPanelOpen: boolean;
  onToggleBottomPanel: () => void;
  devices: OpenFruitDevice[];
  selectedDevice: OpenFruitDevice;
  onSelectDevice: (device: OpenFruitDevice) => void;
  onRunBuild: () => void;
  onBuildAndInstall: () => void;
  onRunDebug: () => void;
  canBuild: boolean;
  canDeploy: boolean;
  engineStatus: string;
  onCancelBuild: () => void;
  isBuilding: boolean;
  // Current engine stage and percent while a build runs.
  buildStatus?: string;
  isDebugging: boolean;
  currentBranch: string;
  isGitActive?: boolean;
  onRefreshDevices?: () => void;
  isScanningDevices?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  projectName,
  onOpenProjectSettings,
  isFileMenuOpen,
  onToggleFileMenu,
  onToggleGitDrawer,
  isLeftPanelOpen,
  onToggleLeftPanel,
  isRightPanelOpen,
  onToggleRightPanel,
  isBottomPanelOpen,
  onToggleBottomPanel,
  devices,
  selectedDevice,
  onSelectDevice,
  onRunBuild, onBuildAndInstall,
  onRunDebug,
  canBuild,
  canDeploy,
  engineStatus,
  onCancelBuild,
  isBuilding,
  buildStatus = '',
  isDebugging,
  currentBranch,
  isGitActive = false,
  onRefreshDevices,
  isScanningDevices
}) => {
  const t = useTranslation();
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false);

  const handleMinimize = () => {
    (window as any).openfruitApi?.minimizeWindow?.();
  };

  const handleMaximize = () => {
    (window as any).openfruitApi?.maximizeWindow?.();
  };

  const handleClose = () => {
    (window as any).openfruitApi?.closeWindow?.() || window.close();
  };

  return (
    <header 
      style={{ WebkitAppRegion: 'drag' } as any}
      className="relative z-30 h-11 bg-fruit-bg border-b border-fruit-border flex items-center justify-between px-3 select-none"
    >
      {/* Left Section: Logo + File Menu + Git Button */}
      <div style={{ WebkitAppRegion: 'no-drag' } as any} className="flex items-center gap-3">
        {/* App Logo */}
        <BrandLogo size="sm" />

        <div className="h-4 w-px bg-fruit-border" />

        {/* File Button */}
        <div className="relative">
          <button
            onClick={onToggleFileMenu}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-syne font-semibold transition-colors ${
              isFileMenuOpen
                ? 'bg-fruit-surface text-fruit-accent border border-fruit-border'
                : 'text-fruit-textMuted hover:text-fruit-text hover:bg-fruit-surface/60'
            }`}
          >
            <span>File</span>
            <ChevronDown className="w-3 h-3 text-fruit-textDim" />
          </button>
        </div>

        {/* Git Button */}
        <button
          onClick={onToggleGitDrawer}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-syne font-semibold transition-all ${
            isGitActive 
              ? 'bg-fruit-accent/20 text-fruit-accent border border-fruit-accent/40 shadow-xs' 
              : 'text-fruit-textMuted hover:text-fruit-text hover:bg-fruit-surface/60 border border-transparent'
          }`}
          title={t("Mostra / nascondi controllo versione Git")}
        >
          <GitBranch className="w-3.5 h-3.5 text-fruit-accent" />
          <span>Git</span>
          <span className="font-mono text-[10px] text-fruit-textDim">({currentBranch})</span>
        </button>
      </div>

      {/* Center Section: App Name in a Luxury Pill */}
      <div 
        style={{ WebkitAppRegion: 'no-drag' } as any} 
        className="absolute left-1/2 -translate-x-1/2 flex items-center"
      >
        <button type="button" onClick={onOpenProjectSettings} aria-label={t("Configurazione progetto")} title={t("Configura Bundle ID, firma e dipendenze")} className="flex items-center gap-2 px-3.5 py-0.5 rounded-full bg-fruit-surface/90 border border-fruit-border hover:border-fruit-borderLight shadow-sm transition-all group cursor-pointer">
          <span className="w-2 h-2 rounded-full bg-fruit-accent animate-pulse" />
          <span className="font-syne font-bold text-xs tracking-wide text-fruit-text group-hover:text-fruit-accent transition-colors">
            {projectName}
          </span>
          <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-fruit-bg text-fruit-textMuted border border-fruit-border">
            iOS
          </span>
        </button>
      </div>

      {/* Right Section: Device Selector + Play + Debug + Panel Toggles + Window Controls */}
      <div style={{ WebkitAppRegion: 'no-drag' } as any} className="flex items-center gap-2">
        {/* USB iPhone Selector */}
        <div className="relative">
          <button
            onClick={() => setShowDeviceDropdown(!showDeviceDropdown)}
            className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-fruit-surface hover:bg-fruit-surfaceHover border border-fruit-border text-xs font-syne text-fruit-text transition-colors"
          >
            <Smartphone className={`w-3.5 h-3.5 ${selectedDevice.connected ? 'text-fruit-accent' : 'text-fruit-textDim'}`} />
            <span className="truncate max-w-[130px] text-xs font-medium">
              {selectedDevice.name}
            </span>
            <span className="font-mono text-[9px] text-fruit-textDim uppercase">
              {selectedDevice.type}
            </span>
            <ChevronDown className="w-3 h-3 text-fruit-textDim ml-0.5" />
          </button>

          {/* Device Dropdown Menu */}
          {showDeviceDropdown && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowDeviceDropdown(false)} 
              />
              <div className="absolute right-0 top-full mt-1.5 z-50 w-72 bg-fruit-surface border border-fruit-border rounded-xl shadow-popup py-1.5 text-xs font-syne animate-fadeIn">
                <div className="flex items-center justify-between px-3 py-1 text-[10px] font-mono text-fruit-textDim tracking-wider uppercase border-b border-fruit-border/60 mb-1">
                  <span>{t("Dispositivi iOS USB / Wi-Fi")}</span>
                  {onRefreshDevices && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRefreshDevices();
                      }}
                      className="hover:text-fruit-accent p-0.5 rounded transition-colors"
                      title={t("Aggiorna dispositivi da OpenFruit")}
                    >
                      <Loader2 className={`w-3 h-3 ${isScanningDevices ? 'animate-spin text-fruit-accent' : ''}`} />
                    </button>
                  )}
                </div>
                {devices.map(dev => (
                  <button
                    key={dev.udid}
                    onClick={() => {
                      onSelectDevice(dev);
                      setShowDeviceDropdown(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 hover:bg-fruit-surfaceHover text-left transition-colors ${
                      dev.udid === selectedDevice.udid ? 'bg-fruit-surfaceHover/60 text-fruit-accent' : 'text-fruit-text'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${dev.connected ? 'bg-fruit-accent' : 'bg-fruit-textDim'}`} />
                      <div className="truncate">
                        <div className="font-semibold">{dev.name}</div>
                        <div className="text-[10px] font-mono text-fruit-textDim">
                          {dev.connected ? `${dev.model}${dev.iosVersion ? " • iOS " + dev.iosVersion : ""}` : dev.model}
                        </div>
                      </div>
                    </div>
                    {dev.connected && (
                      <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-fruit-bg border border-fruit-border text-fruit-textMuted uppercase">
                        {dev.type}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Play Button */}
        <button
          onClick={onRunBuild}
          disabled={isBuilding || !canBuild}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-fruit-accent hover:bg-fruit-accentHover disabled:opacity-40 text-fruit-accentDark font-syne font-bold text-xs shadow-sm transition-all transform active:scale-95"
          title={!canBuild ? engineStatus : t("Compila il progetto senza installarlo")}
        >
          {isBuilding ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin stroke-[2.5]" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current stroke-[1.5]" />
          )}
          <span>{isBuilding ? (buildStatus || 'Build...') : 'Build'}</span>
        </button>

<button onClick={onBuildAndInstall} disabled={isBuilding || !canBuild || !canDeploy || !selectedDevice.connected} title={t("Compila e installa sul dispositivo selezionato")} className="px-2 py-1 border border-fruit-border rounded text-xs disabled:opacity-40">{t("Build e installa")}</button>
        {/* Debug Button */}
        <button
          onClick={onRunDebug}
          disabled
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-fruit-surface hover:bg-fruit-surfaceHover border border-fruit-border text-xs font-syne font-semibold text-fruit-text transition-colors"
          title={t("Sessione debug IDE non supportata dal contratto OpenFruit corrente")}
        >
          {isDebugging ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-fruit-syntaxCoral" />
          ) : (
            <Bug className="w-3.5 h-3.5 text-fruit-syntaxCoral" />
          )}
          <span>Debug</span>
        </button>

        {isBuilding ? (
          <button onClick={onCancelBuild} className="text-xs text-fruit-syntaxCoral" title={t("Interrompi OpenFruit e i processi figli")}>{t("Interrompi")}</button>
        ) : (
          <span className="text-[9px] text-fruit-textMuted" title={engineStatus}>
            {canBuild ? t("OpenFruit collegato") : t("OpenFruit non disponibile")}
          </span>
        )}

        <div className="h-4 w-px bg-fruit-border mx-0.5" />

        {/* Panel Toggles */}
        <div className="flex items-center gap-0.5 bg-fruit-bg/80 border border-fruit-border rounded-lg p-0.5">
          <button
            onClick={onToggleLeftPanel}
            className={`p-1.5 rounded-md transition-colors ${
              isLeftPanelOpen ? 'text-fruit-accent bg-fruit-surface' : 'text-fruit-textDim hover:text-fruit-text'
            }`}
            title={isLeftPanelOpen ? t("Nascondi File Explorer") : t("Mostra File Explorer")}
          >
            {isLeftPanelOpen ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={onToggleBottomPanel}
            className={`p-1.5 rounded-md transition-colors ${
              isBottomPanelOpen ? 'text-fruit-accent bg-fruit-surface' : 'text-fruit-textDim hover:text-fruit-text'
            }`}
            title={isBottomPanelOpen ? t("Nascondi Console") : t("Mostra Console")}
          >
            {isBottomPanelOpen ? <PanelBottomClose className="w-3.5 h-3.5" /> : <PanelBottom className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={onToggleRightPanel}
            className={`p-1.5 rounded-md transition-colors ${
              isRightPanelOpen ? 'text-fruit-accent bg-fruit-surface' : 'text-fruit-textDim hover:text-fruit-text'
            }`}
            title={isRightPanelOpen ? t("Nascondi Canvas") : t("Mostra Canvas")}
          >
            {isRightPanelOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRight className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="h-4 w-px bg-fruit-border mx-0.5" />

        {/* Custom Window Controls (Sostituiscono la barra nativa di Windows) */}
        <div className="flex items-center gap-0.5 ml-1">
          <button
            onClick={handleMinimize}
            className="p-1.5 rounded-md hover:bg-fruit-surface text-fruit-textDim hover:text-fruit-text transition-colors"
            title={t("Riduci a icona")}
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            onClick={handleMaximize}
            className="p-1.5 rounded-md hover:bg-fruit-surface text-fruit-textDim hover:text-fruit-text transition-colors"
            title={t("Ingrandisci")}
          >
            <Square className="w-2.5 h-2.5" />
          </button>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-md hover:bg-fruit-syntaxCoral/20 hover:text-fruit-syntaxCoral text-fruit-textDim transition-colors"
            title={t("Chiudi")}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </header>
  );
};
