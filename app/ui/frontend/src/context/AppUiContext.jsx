import React, { createContext, useContext } from 'react'

const noop = () => {}

const AppUiContext = createContext({
  showToast: noop,
  requestConfirm: async () => false,
})

export function AppUiProvider({ value, children }) {
  return (
    <AppUiContext.Provider value={value}>
      {children}
    </AppUiContext.Provider>
  )
}

export function useAppUi() {
  return useContext(AppUiContext)
}
