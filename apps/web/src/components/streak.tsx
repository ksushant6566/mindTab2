import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { activityQueryOptions } from '~/api/hooks'
import { useAuth } from '~/api/hooks/use-auth'

type ActivityDay = {
    date?: string
    count?: number
}

function toDateKey(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function getActivityStreak(activity: ActivityDay[]) {
    const activeDays = new Set(activity.filter((day) => (day.count ?? 0) > 0 && day.date).map((day) => day.date as string))
    let streak = 0
    const cursor = new Date()

    while (activeDays.has(toDateKey(cursor))) {
        streak += 1
        cursor.setDate(cursor.getDate() - 1)
    }

    return streak
}

export default function Streak() {
    const { user } = useAuth()
    const { data: activity } = useQuery({
        ...activityQueryOptions(user?.id ?? ''),
        enabled: Boolean(user?.id),
        refetchOnWindowFocus: false,
        refetchOnMount: false,
    })

    const streak = useMemo(() => {
        return getActivityStreak(Array.isArray(activity) ? activity as ActivityDay[] : [])
    }, [activity])

    return (
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${streak === 0 ? 'bg-red-500' : 'bg-green-500'}`}></div>
                <p className="text-sm font-medium">{streak} days streak</p>
            </div>
        </div>
    )
}
