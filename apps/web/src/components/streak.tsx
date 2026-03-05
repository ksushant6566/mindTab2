import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getStreak } from '~/lib/utils'
import { habitTrackerQueryOptions } from '~/api/hooks'

export default function Streak() {
    const { data: habitTracker } = useQuery({
        ...habitTrackerQueryOptions(),
        refetchOnWindowFocus: false,
        refetchOnMount: false,
    })

    const streak = useMemo(() => {
        return getStreak((habitTracker as any) || [])
    }, [habitTracker])

    return (
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${streak === 0 ? 'bg-red-500' : 'bg-green-500'}`}></div>
                <p className="text-sm font-medium">{streak} days streak</p>
            </div>
        </div>
    )
}
