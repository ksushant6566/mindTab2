import { useAuth } from "~/api/hooks/use-auth"

export const XP = () => {
    const { user } = useAuth()

    return (
        <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-yellow-500" />
            <p className="text-sm font-medium">{user?.xp} XP</p>
        </div>
    )
}
