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
    openMenu: string
    closeMenu: string
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
    mobileTabChat: string
    mobileTabPlan: string
    mobileTabProperties: string
    floorGround: string
    floorUpper: string
    floorBasement: string
    toolSelect: string
    toolAddRoom: string
    toolAddWall: string
    toolCostBoq: string
    toolExportPdf: string
    exportPdfLoading: string
    toolExportIfc: string
    exportIfcLoading: string
    toolExportPermitDoc: string
    exportPermitDocLoading: string
    toolView2d: string
    toolView3d: string
    addWallHintFirstClick: string
    addWallHintSecondClick: string
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
      tabLayers: string
      tabReinforcement: string
      functionLabels: {
        STRUCTURAL: string
        INSULATION: string
        RENDER: string
        FINISH: string
        PAINT: string
      }
    }
    wallReinforcement: {
      title: string
      empty: string
    }
    costBoqPanel: {
      title: string
      grandTotal: string
      subtotalMaterials: string
      subtotalLabor: string
      laborSection: string
      taxSection: string
      vatRate: string
      vatNote: string
      loading: string
      empty: string
      unverifiedChip: string
      quantityColumn: string
      unitPriceColumn: string
      lineTotalColumn: string
      standardColumn: string
      categories: {
        wall: string
        foundation: string
        tieColumn: string
        centura: string
        lintel: string
        roof: string
        other: string
      }
    }
    structuralInspector: {
      toolFoundation: string
      toolTieColumns: string
      toolCenturi: string
      toolRoof: string
      toolLintel: string
      toolStaircase: string
      loading: string
      verified: string
      unverified: string
      unverifiedNotice: string
      concreteClass: string
      cover: string
      barDiameter: string
      barSpacing: string
      barCount: string
      role: {
        LONGITUDINAL: string
        STIRRUP: string
        TRANSVERSE: string
      }
      foundation: {
        title: string
        depth: string
        width: string
        assemblyTitle: string
        reinforcementTitle: string
      }
      tieColumns: {
        title: string
        empty: string
        category: string
        floor: string
        crossSection: string
      }
      centuri: {
        title: string
        empty: string
        wall: string
        level: string
        height: string
        width: string
      }
      lintel: {
        title: string
        selectOpeningHint: string
        material: string
        length: string
        width: string
        bearingLength: string
        prefabricated: string
        yes: string
        no: string
      }
      roof: {
        title: string
        typeLabel: string
        pitch: string
        overhang: string
        ridgeHeight: string
        material: string
        pitchDefaultHint: string
        overhangDefaultHint: string
        saving: string
        types: {
          GABLED: string
          HIPPED: string
          FLAT: string
          MONOSLOPE: string
        }
      }
      staircase: {
        title: string
        empty: string
        addButton: string
        floor: string
        width: string
        length: string
        riserCount: string
        riserHeight: string
        treadDepth: string
        horizontalRun: string
        blondelCheck: string
        blondelTarget: string
        handedness: string
        handednessRight: string
        handednessLeft: string
        codeCompliant: string
        codeViolation: string
        loading: string
        deleteButton: string
      }
    }
    viewer3d: {
      lodLabel: string
      masonryComputing: string
      brickCountLabel: string
      rebarCountLabel: string
      stirrupCountLabel: string
      tieColumnCountLabel: string
      centuraCountLabel: string
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
  collaboration: {
    title: string
    members: string
    inviteEmail: string
    inviteRole: string
    inviteButton: string
    roleOwner: string
    roleEditor: string
    roleViewer: string
    removeButton: string
    pendingInvite: string
    noMembers: string
    toolCollab: string
  }
  rules: {
    energySection: string
    energyWallU: string
    fireSection: string
    fireCompartment: string
    fireStaircase: string
    accessibilitySection: string
    accessibilityEntry: string
    accessibilityBathroom: string
  }
  tasks: {
    title: string
    empty: string
    addButton: string
    titleLabel: string
    descriptionLabel: string
    priorityLabel: string
    assigneeLabel: string
    dueDateLabel: string
    statusTodo: string
    statusInProgress: string
    statusDone: string
    statusCancelled: string
    priorityLow: string
    priorityMedium: string
    priorityHigh: string
    markDone: string
    markInProgress: string
    deleteButton: string
    overdue: string
    toolTasks: string
    loading: string
    noAssignee: string
  }
  mep: {
    /** Toolbar button label */
    toolMep: string
    /** Inspector panel title */
    title: string
    loading: string
    /** Empty state — house has no rooms yet */
    empty: string
    /** Regenerate button (after room types changed) */
    regenerateButton: string
    regenerating: string
    /** Per-room header label prefix, e.g. "Cameră: Baie" */
    roomLabel: string
    /** Fallback when room type is not classifiable to a known MEP category */
    unknownRoom: string
    /** Standard reference column heading */
    standardColumn: string
    /** Count column heading */
    countColumn: string
    typeLabels: {
      WATER_SUPPLY: string
      HOT_WATER_SUPPLY: string
      DRAIN: string
      ELECTRICAL_OUTLET: string
      SWITCH: string
      LIGHTING_POINT: string
    }
  }
  marketplace: {
    title: string
    subtitle: string
    allCategories: string
    allSuppliers: string
    categoryLabel: string
    supplierLabel: string
    noResults: string
    loading: string
    unitPrice: string
    standardRef: string
    priceUnverified: string
    addToProject: string
    selectProject: string
    selectWall: string
    confirmAdd: string
    addSuccess: string
    categories: {
      BLOCK: string
      INSULATION: string
      RENDER: string
      FINISH: string
      PAINT: string
      CONCRETE: string
      REBAR: string
      PRECAST: string
      ROOFING: string
      OTHER: string
    }
  }
  admin: {
    title: string
    dashboardTitle: string
    usersTitle: string
    statsUsers: string
    statsProjects: string
    statsHouses: string
    statsMaterials: string
    userEmail: string
    userName: string
    userRole: string
    userVerified: string
    userCreated: string
    changeRole: string
    roleSaved: string
    accessDenied: string
    loading: string
    navDashboard: string
    navUsers: string
    navAiSettings: string
    roles: {
      GUEST: string
      USER: string
      CLIENT: string
      ARCHITECT: string
      STRUCTURAL_ENGINEER: string
      MEP_ENGINEER: string
      ELECTRICAL_ENGINEER: string
      CONTRACTOR: string
      MANUFACTURER: string
      SUPPLIER: string
      ADMIN: string
      SUPERADMIN: string
    }
  }
  floorPlanImport: {
    toolImport: string
    modalTitle: string
    modalSubtitle: string
    dropzone: string
    dropzoneActive: string
    importing: string
    success: string
    error: string
    close: string
    importButton: string
    roomsCreated: string
  }
}
