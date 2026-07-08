export type Locale = 'ro' | 'hu' | 'en'

export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'ro', label: 'Română' },
  { code: 'hu', label: 'Magyar' },
  { code: 'en', label: 'English' },
]

export const DEFAULT_LOCALE: Locale = 'ro'

// BCP-47 tag used for Date#toLocaleDateString and similar formatting.
export const DATE_LOCALES: Record<Locale, string> = {
  ro: 'ro-RO',
  hu: 'hu-HU',
  en: 'en-US',
}

export interface Dictionary {
  common: {
    appName: string
    loading: string
  }
  nav: {
    projects: string
    marketplace: string
    settings: string
  }
  sidebar: {
    projects: string
    marketplace: string
    settings: string
    logout: string
  }
  landing: {
    headerLogin: string
    headerCta: string
    heroTitle: string
    heroHighlight: string
    heroSubtitle: string
    ctaPrimary: string
    ctaSecondary: string
    features: { icon: string; title: string; desc: string }[]
    footerTagline: string
  }
  projectsPage: {
    title: string
    subtitle: string
  }
  projectsGrid: {
    newProject: string
    modalTitle: string
    namePlaceholder: string
    cancel: string
    create: string
    creating: string
    status: {
      DRAFT: string
      INTERVIEW: string
      DESIGNING: string
      REVIEW: string
      COMPLETE: string
    }
  }
  projectDetail: {
    notFound: string
    openEditor: string
    aiAssistantTitle: string
    detailsTitle: string
    typeLabel: string
    statusLabel: string
    styleLabel: string
    quickActionsTitle: string
    actionValidateRules: string
    actionEstimateCost: string
    actionExportDxf: string
  }
  editor: {
    aiAssistantTitle: string
    propertiesTitle: string
    toolSelect: string
    toolAddRoom: string
    toolAddWall: string
    toolView2d: string
    toolView3d: string
    selectRoomHint: string
    selectedRoomLabel: string
    area: string
    width: string
    height: string
    floor: string
    deleteRoom: string
    deletingRoom: string
    emptyCanvasHint: string
    layerPanel: {
      title: string
      selectWallHint: string
      loading: string
      materialColumn: string
      thicknessColumn: string
      standardColumn: string
      priceColumn: string
      priceUnverifiedNotice: string
      functionLabels: {
        STRUCTURAL: string
        INSULATION: string
        RENDER: string
        FINISH: string
        PAINT: string
      }
    }
    viewer3d: {
      lodLabel: string
      masonryComputing: string
      brickCountLabel: string
      rebarCountLabel: string
      fpsLabel: string
      lowPerfNotice: string
    }
  }
  aiChat: {
    greeting1: string
    greeting2: string
    placeholder: string
    error: string
    quotaExceeded: string
    roomAdded: string
    roomUpdated: string
    rebuildButton: string
    rebuilding: string
    rebuildDone: string
    rebuildError: string
  }
  auth: {
    register: {
      title: string
      subtitle: string
      nameLabel: string
      namePlaceholder: string
      emailLabel: string
      emailPlaceholder: string
      passwordLabel: string
      passwordPlaceholder: string
      submit: string
      submitting: string
      hasAccount: string
      loginLink: string
      checkEmailTitle: string
      checkEmailBody: string
      genericError: string
    }
    login: {
      title: string
      subtitle: string
      emailLabel: string
      emailPlaceholder: string
      passwordLabel: string
      passwordPlaceholder: string
      submit: string
      submitting: string
      noAccount: string
      registerLink: string
      wrongCredentials: string
      unverified: string
      resendVerification: string
      resent: string
    }
    verifyEmail: {
      invalidLink: string
      verifyingTitle: string
      verifyingBody: string
      successTitle: string
      successBody: string
      errorTitle: string
      genericError: string
      backToLogin: string
    }
  }
  validation: {
    nameMin: string
    emailInvalid: string
    passwordMin: string
    passwordRequired: string
  }
  adminAiSettings: {
    title: string
    description: string
    toggleLabel: string
    toggleHintOn: string
    toggleHintOff: string
    saving: string
    accessDenied: string
  }
}
