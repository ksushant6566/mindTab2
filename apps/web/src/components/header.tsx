import React, { useEffect, useState } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { CommandMenu } from './command-menu'
import Streak from './streak'
import { XP } from './xp'
import { useAuth } from '~/api/hooks/use-auth'
import { Button } from './ui/button'

export const Header = () => {
  const { user } = useAuth()
  const location = useLocation()

  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  if (!isHydrated) return null

  return (
    <div className="flex w-full justify-end items-center gap-6">
      <nav className="flex items-center gap-2">
        <Button asChild size="sm" variant={location.pathname === '/' ? 'default' : 'secondary'}>
          <Link to="/">Dashboard</Link>
        </Button>
        <Button asChild size="sm" variant={location.pathname === '/habits' ? 'default' : 'secondary'}>
          <Link to="/habits">Habits</Link>
        </Button>
      </nav>
      <CommandMenu />
      <div className="flex items-center gap-4">
        <div className="relative ml-8 flex items-center">
          <div className="absolute left-0 top-0 flex h-10 w-10 -translate-x-[78%] -translate-y-[6%] items-center justify-center rounded-full bg-blue-800 cursor-pointer">
            <a href="https://mindtab.in" target="_blank">
              <h1 className="text-xl font-medium text-white">M</h1>
            </a>
          </div>
          {user?.image ? (
            <a href={`https://mindtab.in/users/${user.email}`} target="_blank" className="z-10">
              <img
                src={user.image}
                alt="profile"
                className="z-10 h-9 w-9 rounded-full ring-1 ring-white"
                loading="lazy"
              />
            </a>
          ) : (
            <div className="z-10 h-10 w-10 rounded-full bg-slate-300" />
          )}
        </div>
        <Streak />
        <XP />
      </div>
    </div>
  )
}
