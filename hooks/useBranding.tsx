"use client"

import React, { createContext, useContext } from "react"

interface BrandingData {
    logoLightUrl: string | null
    logoDarkUrl: string | null
    faviconUrl: string | null
}

const BrandingContext = createContext<BrandingData>({
    logoLightUrl: null,
    logoDarkUrl: null,
    faviconUrl: null,
})

export function BrandingProvider({
    children,
    branding,
}: {
    children: React.ReactNode
    branding: BrandingData
}) {
    return (
        <BrandingContext.Provider value={branding}>
            {children}
        </BrandingContext.Provider>
    )
}

export function useBranding() {
    return useContext(BrandingContext)
}
