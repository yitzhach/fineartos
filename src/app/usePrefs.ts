/**
 * What the artist has chosen, kept in localStorage: preferences and a few
 * small lists that predate the database. Each is written back whenever it
 * changes. Records live in IndexedDB — see useStudioData.
 */
import { useEffect, useState } from 'react';
import type { DesktopLayout, IconPosition } from '../os/desktopLayout';
import type { CustomWallpaper } from '../lib/wallpapers';
import {
  loadAskForSignature,
  loadDesktopLayout,
  loadMileageRate,
  loadPaymentInstructions,
  loadRestoreWindows,
  loadSiteUrl,
  loadStudioDefaults,
  loadTheme,
  loadTrashPosition,
  loadWallpaper,
  loadWallpaperLibrary,
  saveAskForSignature,
  saveDesktopLayout,
  saveMileageRate,
  savePaymentInstructions,
  saveRestoreWindows,
  saveSiteUrl,
  saveStudioDefaults,
  saveTheme,
  saveTrashPosition,
  saveWallpaper,
  saveWallpaperLibrary,
  type PaymentInstructions,
  type StudioDefaults,
  type Theme,
  type WallpaperChoice,
} from '../lib/prefs';

export function usePrefs() {
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [wallpaper, setWallpaper] = useState<WallpaperChoice>(loadWallpaper);
  const [wallpaperLibrary, setWallpaperLibrary] = useState<CustomWallpaper[]>(loadWallpaperLibrary);
  const [studio, setStudio] = useState<StudioDefaults>(loadStudioDefaults);
  const [payment, setPayment] = useState<PaymentInstructions>(loadPaymentInstructions);
  const [askForSignature, setAskForSignature] = useState<boolean>(loadAskForSignature);
  const [restoreWindowsOn, setRestoreWindowsOn] = useState<boolean>(loadRestoreWindows);
  const [mileageRate, setMileageRate] = useState<number | null>(loadMileageRate);
  const [siteUrl, setSiteUrl] = useState(loadSiteUrl);
  const [desktopLayout, setDesktopLayout] = useState<DesktopLayout>(loadDesktopLayout);
  const [trashPosition, setTrashPosition] = useState<IconPosition | null>(loadTrashPosition);

  useEffect(() => saveTheme(theme), [theme]);
  useEffect(() => saveWallpaper(wallpaper), [wallpaper]);
  useEffect(() => saveWallpaperLibrary(wallpaperLibrary), [wallpaperLibrary]);
  useEffect(() => saveStudioDefaults(studio), [studio]);
  useEffect(() => savePaymentInstructions(payment), [payment]);
  useEffect(() => saveAskForSignature(askForSignature), [askForSignature]);
  useEffect(() => saveRestoreWindows(restoreWindowsOn), [restoreWindowsOn]);
  useEffect(() => saveMileageRate(mileageRate), [mileageRate]);
  useEffect(() => saveSiteUrl(siteUrl), [siteUrl]);
  useEffect(() => saveDesktopLayout(desktopLayout), [desktopLayout]);
  useEffect(() => saveTrashPosition(trashPosition), [trashPosition]);

  return {
    theme,
    setTheme,
    wallpaper,
    setWallpaper,
    wallpaperLibrary,
    setWallpaperLibrary,
    studio,
    setStudio,
    payment,
    setPayment,
    askForSignature,
    setAskForSignature,
    restoreWindowsOn,
    setRestoreWindowsOn,
    mileageRate,
    setMileageRate,
    siteUrl,
    setSiteUrl,
    desktopLayout,
    setDesktopLayout,
    trashPosition,
    setTrashPosition,
  };
}
