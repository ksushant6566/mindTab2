package services

import (
	"reflect"
	"testing"
)

func TestUniformDownsample(t *testing.T) {
	t.Run("10 items cap 5 returns 5 evenly spaced items", func(t *testing.T) {
		items := []string{"a", "b", "c", "d", "e", "f", "g", "h", "i", "j"}
		got := uniformDownsample(items, 5)
		want := []string{"a", "c", "f", "h", "j"}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("uniformDownsample(10 items, 5) = %v, want %v", got, want)
		}
	})

	t.Run("3 items cap 10 returns all 3 items", func(t *testing.T) {
		items := []string{"x", "y", "z"}
		got := uniformDownsample(items, 10)
		want := []string{"x", "y", "z"}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("uniformDownsample(3 items, 10) = %v, want %v", got, want)
		}
	})

	t.Run("empty input returns empty output", func(t *testing.T) {
		got := uniformDownsample([]string{}, 5)
		if len(got) != 0 {
			t.Errorf("uniformDownsample(empty, 5) = %v, want empty", got)
		}
	})

	t.Run("1 item cap 1 returns that item", func(t *testing.T) {
		items := []string{"only"}
		got := uniformDownsample(items, 1)
		want := []string{"only"}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("uniformDownsample(1 item, 1) = %v, want %v", got, want)
		}
	})

	t.Run("multiple items cap 1 returns one representative item", func(t *testing.T) {
		items := []string{"first", "middle", "last"}
		got := uniformDownsample(items, 1)
		want := []string{"middle"}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("uniformDownsample(3 items, 1) = %v, want %v", got, want)
		}
	})

	t.Run("5 items cap 5 returns all 5 items", func(t *testing.T) {
		items := []string{"p", "q", "r", "s", "t"}
		got := uniformDownsample(items, 5)
		want := []string{"p", "q", "r", "s", "t"}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("uniformDownsample(5 items, 5) = %v, want %v", got, want)
		}
	})
}
