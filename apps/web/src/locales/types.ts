export type Locale = 'ro' | 'hu' | 'en'

export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'ro', label: 'Română' },
  { code: 'hu', label: 'Magyar' },
  { code: 'en', label: 'English' },
]

export const DEFAULT_LOCALE: Locale = 'ro'

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
}
