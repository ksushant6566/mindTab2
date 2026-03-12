import { View, Text, Dimensions } from "react-native";
import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { api } from "~/lib/api-client";
import { useAuth } from "~/hooks/use-auth";
import { toast } from "sonner-native";

import { WelcomeStep } from "~/components/onboarding/welcome-step";
import { CreateProjectStep } from "~/components/onboarding/create-project-step";
import { CreateGoalStep } from "~/components/onboarding/create-goal-step";
import { CreateHabitStep } from "~/components/onboarding/create-habit-step";
import { NotesIntroStep } from "~/components/onboarding/notes-intro-step";
import { ExtensionStep } from "~/components/onboarding/extension-step";
import { CompleteStep } from "~/components/onboarding/complete-step";

const TOTAL_STEPS = 7;
const STEP_LABELS = ["Welcome", "Project", "Goal", "Habit", "Notes", "Extension", "Complete"];
const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function OnboardingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);

  // Data passed between steps
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [createdProjectName, setCreatedProjectName] = useState("");

  // Animation
  const translateX = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const animateTo = useCallback((step: number) => {
    translateX.value = withTiming(-step * SCREEN_WIDTH, {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    });
    setCurrentStep(step);
  }, [translateX]);

  const handleNext = useCallback(() => {
    if (currentStep < TOTAL_STEPS - 1) animateTo(currentStep + 1);
  }, [currentStep, animateTo]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) animateTo(currentStep - 1);
  }, [currentStep, animateTo]);

  const handleProjectCreated = useCallback((id: string, name: string) => {
    setCreatedProjectId(id);
    setCreatedProjectName(name);
    handleNext();
  }, [handleNext]);

  const handleGoalCreated = useCallback(() => {
    handleNext();
  }, [handleNext]);

  const handleHabitCreated = useCallback(() => {
    handleNext();
  }, [handleNext]);

  const handleComplete = useCallback(async () => {
    setIsCompleting(true);
    try {
      const { error } = await api.PATCH("/users/me", {
        body: { onboardingCompleted: true },
      });
      if (error) throw error;
      router.replace("/(main)/goals");
    } catch {
      toast.error("Failed to complete onboarding");
      setIsCompleting(false);
    }
  }, [router]);

  const progress = (currentStep + 1) / TOTAL_STEPS;

  return (
    <View className="flex-1 bg-background">
      {/* Progress bar */}
      <View className="px-6 pt-14 pb-2">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-sm text-muted-foreground">
            Step {currentStep + 1} of {TOTAL_STEPS}
          </Text>
          <Text className="text-sm text-foreground/70 font-medium">
            {STEP_LABELS[currentStep]}
          </Text>
        </View>
        <View className="h-1 rounded-full bg-border/30 overflow-hidden">
          <View
            className="h-full rounded-full bg-primary"
            style={{ width: `${progress * 100}%` }}
          />
        </View>
      </View>

      {/* Steps container */}
      <Animated.View
        style={[
          {
            flexDirection: "row",
            width: SCREEN_WIDTH * TOTAL_STEPS,
            flex: 1,
          },
          animatedStyle,
        ]}
      >
        <View style={{ width: SCREEN_WIDTH }}>
          <WelcomeStep userName={user?.name ?? "there"} onNext={handleNext} />
        </View>
        <View style={{ width: SCREEN_WIDTH }}>
          <CreateProjectStep
            onProjectCreated={handleProjectCreated}
            onBack={handleBack}
            alreadyCreated={!!createdProjectId}
            initialName={createdProjectName}
          />
        </View>
        <View style={{ width: SCREEN_WIDTH }}>
          <CreateGoalStep
            projectId={createdProjectId}
            onGoalCreated={handleGoalCreated}
            onBack={handleBack}
          />
        </View>
        <View style={{ width: SCREEN_WIDTH }}>
          <CreateHabitStep
            onHabitCreated={handleHabitCreated}
            onBack={handleBack}
          />
        </View>
        <View style={{ width: SCREEN_WIDTH }}>
          <NotesIntroStep onNext={handleNext} onBack={handleBack} />
        </View>
        <View style={{ width: SCREEN_WIDTH }}>
          <ExtensionStep onNext={handleNext} onBack={handleBack} />
        </View>
        <View style={{ width: SCREEN_WIDTH }}>
          <CompleteStep onComplete={handleComplete} loading={isCompleting} />
        </View>
      </Animated.View>
    </View>
  );
}
