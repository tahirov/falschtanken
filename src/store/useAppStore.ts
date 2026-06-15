import { create } from 'zustand'
import type { Lang } from '@/lib/i18n'

export interface CaseState {
  situation: string
  engineStarted: string
  litres: string
  location: string
  vehicle: string
  contactName: string
  contactPhone: string
  allComplete: boolean
  eta: number
  price: number
  orderId: string | null
  // intake step management
  currentStep: number
  // language
  lang: Lang
}

interface AppActions {
  setSituation: (v: string) => void
  setEngineStarted: (v: string) => void
  setLitres: (v: string) => void
  setLocation: (v: string) => void
  setVehicle: (v: string) => void
  setContactName: (v: string) => void
  setContactPhone: (v: string) => void
  setAllComplete: (v: boolean) => void
  setEta: (v: number) => void
  setPrice: (v: number) => void
  setOrderId: (v: string | null) => void
  setCurrentStep: (v: number) => void
  setLang: (v: Lang) => void
  resetCase: () => void
}

const initialState: CaseState = {
  situation: '',
  engineStarted: '',
  litres: '',
  location: '',
  vehicle: '',
  contactName: '',
  contactPhone: '',
  allComplete: false,
  eta: 0,
  price: 150,
  orderId: null,
  currentStep: 0,
  lang: 'de',
}

export const useAppStore = create<CaseState & AppActions>((set) => ({
  ...initialState,
  setSituation: (v) => set({ situation: v }),
  setEngineStarted: (v) => set({ engineStarted: v }),
  setLitres: (v) => set({ litres: v }),
  setLocation: (v) => set({ location: v }),
  setVehicle: (v) => set({ vehicle: v }),
  setContactName: (v) => set({ contactName: v }),
  setContactPhone: (v) => set({ contactPhone: v }),
  setAllComplete: (v) => set({ allComplete: v }),
  setEta: (v) => set({ eta: v }),
  setPrice: (v) => set({ price: v }),
  setOrderId: (v) => set({ orderId: v }),
  setCurrentStep: (v) => set({ currentStep: v }),
  setLang: (v) => set({ lang: v }),
  resetCase: () => set(initialState),
}))
