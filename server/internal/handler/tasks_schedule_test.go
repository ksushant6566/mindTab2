package handler

import "testing"

func TestParseScheduleRange(t *testing.T) {
	start := "2026-07-10T09:00:00Z"
	end := "2026-07-10T10:00:00Z"

	parsedStart, parsedEnd, err := parseScheduleRange(&start, &end)
	if err != nil {
		t.Fatalf("parseScheduleRange returned an error: %v", err)
	}
	if !parsedStart.Valid || !parsedEnd.Valid {
		t.Fatal("expected both schedule timestamps to be valid")
	}
	if !parsedStart.Time.Before(parsedEnd.Time) {
		t.Fatal("expected schedule start to be before schedule end")
	}
}

func TestParseScheduleRangeAllowsUnscheduledTask(t *testing.T) {
	start, end, err := parseScheduleRange(nil, nil)
	if err != nil {
		t.Fatalf("parseScheduleRange returned an error: %v", err)
	}
	if start.Valid || end.Valid {
		t.Fatal("expected an unscheduled task to return null timestamps")
	}
}

func TestParseScheduleRangeRejectsPartialRange(t *testing.T) {
	start := "2026-07-10T09:00:00Z"

	if _, _, err := parseScheduleRange(&start, nil); err == nil {
		t.Fatal("expected a partial schedule range to be rejected")
	}
}

func TestParseScheduleRangeRejectsNonPositiveRange(t *testing.T) {
	start := "2026-07-10T10:00:00Z"
	end := "2026-07-10T09:00:00Z"

	if _, _, err := parseScheduleRange(&start, &end); err == nil {
		t.Fatal("expected a schedule ending before it starts to be rejected")
	}
}
