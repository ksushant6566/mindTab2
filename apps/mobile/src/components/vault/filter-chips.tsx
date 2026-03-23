import { Pressable, StyleSheet, Text, View } from "react-native";

type FilterChipsProps = {
  activeFilter: "all" | "article" | "image";
  onFilterChange: (filter: "all" | "article" | "image") => void;
};

const CHIPS: { key: "all" | "article" | "image"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "article", label: "Articles" },
  { key: "image", label: "Images" },
];

export function FilterChips({ activeFilter, onFilterChange }: FilterChipsProps) {
  return (
    <View style={styles.container}>
      {CHIPS.map((chip) => {
        const isActive = activeFilter === chip.key;
        return (
          <Pressable
            key={chip.key}
            onPress={() => onFilterChange(chip.key)}
            style={isActive ? styles.chipActive : styles.chipInactive}
          >
            <Text style={isActive ? styles.chipTextActive : styles.chipTextInactive}>
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chipActive: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipTextActive: {
    color: "#0a0a0a",
    fontSize: 12,
    fontWeight: "600",
  },
  chipInactive: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#222222",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipTextInactive: {
    color: "#777777",
    fontSize: 12,
  },
});
