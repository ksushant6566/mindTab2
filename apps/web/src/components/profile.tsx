import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { CalendarDays, Mail } from "lucide-react";
import { format } from "date-fns";
import { ActivityChart } from "./activity-chart";
import { activityQueryOptions } from "~/api/hooks";

type ProfileProps = {
    userId: string;
    user: {
        id: string;
        name: string | null;
        email: string;
        image: string | null;
        xp: number;
        createdAt: string;
    };
};

export default function Profile({ userId, user }: ProfileProps) {
    const { data: activity = [] } = useQuery(activityQueryOptions(userId));

    return (
        <div className="container mx-auto py-8">
            <div className="flex flex-col gap-6">
                {/* Profile Header */}
                <div className="flex flex-col items-center gap-6">
                    <div className="relative h-40 w-40 overflow-hidden rounded-full ring-2 ring-primary/20">
                        {user.image ? (
                            <img
                                src={user.image}
                                alt={user.name ?? "Profile picture"}
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center bg-muted text-5xl font-bold text-muted-foreground">
                                {user.name?.[0]?.toUpperCase() ?? "?"}
                            </div>
                        )}
                    </div>
                    <div className="text-center space-y-2">
                        <h1 className="text-4xl font-bold">{user.name ?? "Anonymous User"}</h1>
                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                            <Mail className="h-4 w-4" />
                            <span>{user.email}</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    {/* Account Info */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Account Information</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                            <div className="flex items-center gap-4">
                                <CalendarDays className="h-5 w-5 text-muted-foreground" />
                                <div>
                                    <p className="text-sm font-medium">Member Since</p>
                                    <p className="text-sm text-muted-foreground">
                                        {format(new Date(user.createdAt), "MMMM d, yyyy")}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* XP Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle>XP</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                            <div className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-yellow-500" />
                                <p className="text-sm font-medium">{user.xp ?? 0} XP</p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Activity Chart */}
                    <div className="hidden lg:block col-span-2">
                        <ActivityChart activities={activity as any[]} />
                    </div>
                </div>
            </div>
        </div>
    );
}