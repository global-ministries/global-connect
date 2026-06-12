'use client'

import { useEffect, useState } from 'react'

type SupportTicketDiagnosticsFieldsProps = {
  appBuildVersion: string
}

type SafeDiagnostics = {
  currentRoute: string
  browserName: string
  osName: string
  viewport: string
}

const initialDiagnostics: SafeDiagnostics = {
  currentRoute: '',
  browserName: '',
  osName: '',
  viewport: '',
}

export function SupportTicketDiagnosticsFields({ appBuildVersion }: SupportTicketDiagnosticsFieldsProps) {
  const [diagnostics, setDiagnostics] = useState(initialDiagnostics)

  useEffect(() => {
    setDiagnostics({
      currentRoute: window.location.pathname,
      browserName: getBrowserFamily(window.navigator.userAgent),
      osName: getOsFamily(window.navigator.userAgent),
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    })
  }, [])

  return (
    <>
      <input type="hidden" name="currentRoute" value={diagnostics.currentRoute} />
      <input type="hidden" name="browserName" value={diagnostics.browserName} />
      <input type="hidden" name="osName" value={diagnostics.osName} />
      <input type="hidden" name="viewport" value={diagnostics.viewport} />
      <input type="hidden" name="appBuildVersion" value={appBuildVersion} />
      <input type="hidden" name="sentryEventId" value="" />
      <input type="hidden" name="diagnosticsConsent" value="true" />
    </>
  )
}

function getBrowserFamily(userAgent: string) {
  if (/Edg\//.test(userAgent)) return 'Edge'
  if (/Chrome\//.test(userAgent)) return 'Chrome'
  if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) return 'Safari'
  if (/Firefox\//.test(userAgent)) return 'Firefox'
  return 'Unknown'
}

function getOsFamily(userAgent: string) {
  if (/Windows NT/.test(userAgent)) return 'Windows'
  if (/Mac OS X/.test(userAgent)) return 'macOS'
  if (/Android/.test(userAgent)) return 'Android'
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'iOS'
  if (/Linux/.test(userAgent)) return 'Linux'
  return 'Unknown'
}
