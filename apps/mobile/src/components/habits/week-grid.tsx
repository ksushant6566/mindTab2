import { View, Text, ScrollView } from "react-native";
import { colors } from "~/styles/colors";

type TrackerRecord = {
  habitId: string;
  date: string;
  status: string;
};

type WeekGridProps = {
  habits: Array<{ id: string; title: string }>;
  tracker: TrackerRecord[];
};

function getDaysArray(weeksBack: number): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = weeksBack * 7 - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d.toISOString().split("T")[0]);
  }
  return days;
}

const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];

export function WeekGrid({ habits, tracker }: WeekGridProps) {
  const days = getDaysArray(5); // 5 weeks
  const today = new Date().toISOString().split("T")[0];

  const completedSet = new Set(
    tracker
      .filter((t) => t.status === "completed")
      .map((t) => `${t.habitId}:${t.date}`)
  );

  if (habits.length === 0) return null;

  return (
    <View className="mt-4">
      <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 mb-2">
        Weekly Grid
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
        <View>
          {/* Day headers */}
          <View className="flex-row mb-1">
            <View style={{ width: 80 }} />
            {days.map((day) => {
              const d = new Date(day + "T12:00:00");
              return (
                <View key={day} style={{ width: 24 }} className="items-center">
                  <Text className="text-muted-foreground" style={{ fontSize: 9 }}>
                    {dayLabels[d.getDay()]}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Habit rows */}
          {habits.map((habit) => (
            <View key={habit.id} className="flex-row items-center mb-1">
              <View style={{ width: 80 }}>
                <Text className="text-foreground text-xs" numberOfLines={1}>
                  {habit.title}
                </Text>
              </View>
              {days.map((day) => {
                const isToday = day === today;
                const isFuture = day > today;
                const done = completedSet.has(`${habit.id}:${day}`);

                let bg = "bg-secondary"; // missed
                if (isFuture) bg = "bg-border/30";
                else if (done) bg = "bg-emerald-500";

                return (
                  <View key={day} style={{ width: 24 }} className="items-center">
                    <View
                      className={`w-4 h-4 rounded-full ${bg}`}
                      style={isToday ? { borderWidth: 1.5, borderColor: colors.foreground } : undefined}
                    />
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
