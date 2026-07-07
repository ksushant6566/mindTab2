import React, { useEffect, useState } from 'react'
import { CommandMenu } from './command-menu'
import Streak from './streak'

export const Header = () => {
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  if (!isHydrated) return null

  return (
    <div className="flex w-full justify-end items-center gap-6">
      <CommandMenu />
      <Streak />
    </div>
  )
}
