import { useEffect, useRef } from "react";
import { Accelerometer } from "expo-sensors";

const SHAKE_THRESHOLD = 1.8;
const SHAKE_TIMEOUT = 500;

export function useShakeDetector(onShake: () => void) {
  const lastShakeTime = useRef(0);

  useEffect(() => {
    Accelerometer.setUpdateInterval(100);

    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);

      if (magnitude > SHAKE_THRESHOLD) {
        const now = Date.now();
        if (now - lastShakeTime.current > SHAKE_TIMEOUT) {
          lastShakeTime.current = now;
          onShake();
        }
      }
    });

    return () => subscription.remove();
  }, [onShake]);
}
