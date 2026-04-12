/**
 * Navbar theme constants — dark & light mode colors.
 * Extracted from Navbar.tsx to reduce file size.
 */

export interface NavTheme {
  navBg: string; navBorder: string; iconColor: string; logoText: string
  avatarOpenBg: string; dropdownBg: string; dropdownBorder: string; dropdownShadow: string
  menuText: string; menuMuted: string; menuDivider: string
  sidebarBg: string; sidebarBorder: string
  userName: string; userEmail: string; sectionLabel: string
  itemText: string; itemActive: string; itemActiveBg: string
  bottomNavBg: string; bottomNavBorder: string
  loginBtnBorder: string; loginBtnText: string
  guestBtnBg: string; guestBtnText: string; guestBtnBorder: string
  registerBg: string; registerText: string
}

export const NAV_THEME_DARK: NavTheme = {
  navBg: 'rgba(10,22,40,0.97)',
  navBorder: 'rgba(196,153,42,0.12)',
  iconColor: '#94a8c0',
  logoText: '#edeae4',
  avatarOpenBg: 'rgba(255,255,255,0.1)',
  dropdownBg: '#0e1c2f',
  dropdownBorder: 'rgba(196,153,42,0.12)',
  dropdownShadow: '0 8px 32px rgba(0,0,0,0.4)',
  menuText: '#edeae4',
  menuMuted: '#94a3b8',
  menuDivider: 'rgba(196,153,42,0.12)',
  sidebarBg: '#0a1628',
  sidebarBorder: 'rgba(196,153,42,0.12)',
  userName: '#edeae4',
  userEmail: '#94a8c0',
  sectionLabel: '#94a3b8',
  itemText: '#edeae4',
  itemActive: '#C4992A',
  itemActiveBg: 'rgba(196,153,42,0.1)',
  bottomNavBg: 'rgba(10,22,40,0.95)',
  bottomNavBorder: 'rgba(196,153,42,0.12)',
  loginBtnBorder: 'rgba(196,153,42,0.4)',
  loginBtnText: '#C4992A',
  guestBtnBg: 'transparent',
  guestBtnText: '#edeae4',
  guestBtnBorder: 'rgba(196,153,42,0.2)',
  registerBg: '#C4992A',
  registerText: '#070d18',
}

export const NAV_THEME_LIGHT: NavTheme = {
  navBg: 'rgba(255,255,255,0.97)',
  navBorder: '#e2e8f0',
  iconColor: '#4a5568',
  logoText: '#1a1a2e',
  avatarOpenBg: '#e2e8f0',
  dropdownBg: '#ffffff',
  dropdownBorder: '#e2e8f0',
  dropdownShadow: '0 8px 32px rgba(0,0,0,0.12)',
  menuText: '#1a1a2e',
  menuMuted: '#94a3b8',
  menuDivider: '#e2e8f0',
  sidebarBg: '#ffffff',
  sidebarBorder: '#e2e8f0',
  userName: '#1a1a2e',
  userEmail: '#4a5568',
  sectionLabel: '#94a3b8',
  itemText: '#1a1a2e',
  itemActive: '#C4992A',
  itemActiveBg: 'rgba(196,153,42,0.1)',
  bottomNavBg: 'rgba(255,255,255,0.95)',
  bottomNavBorder: '#e2e8f0',
  loginBtnBorder: 'rgba(196,153,42,0.4)',
  loginBtnText: '#C4992A',
  guestBtnBg: 'transparent',
  guestBtnText: '#1a1a2e',
  guestBtnBorder: '#e2e8f0',
  registerBg: '#C4992A',
  registerText: '#070d18',
}

export function getNavTheme(isDark: boolean): NavTheme {
  return isDark ? NAV_THEME_DARK : NAV_THEME_LIGHT
}
