package taskstate

import "testing"

func TestComputeCompletedAtUpdate(t *testing.T) {
	completed := "completed"
	pending := "pending"
	archived := "archived"

	tests := []struct {
		name            string
		currentStatus   string
		requestedStatus *string
		wantSet         bool
		wantValid       bool
	}{
		{name: "no status update", currentStatus: "pending"},
		{name: "transition to completed", currentStatus: "pending", requestedStatus: &completed, wantSet: true, wantValid: true},
		{name: "edit completed task", currentStatus: "completed", requestedStatus: &completed},
		{name: "transition away from completed", currentStatus: "completed", requestedStatus: &pending, wantSet: true},
		{name: "archive preserves completion", currentStatus: "completed", requestedStatus: &archived},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			set, completedAt := ComputeCompletedAtUpdate(tt.currentStatus, tt.requestedStatus)
			if set != tt.wantSet {
				t.Fatalf("set = %v, want %v", set, tt.wantSet)
			}
			if completedAt.Valid != tt.wantValid {
				t.Fatalf("completedAt.Valid = %v, want %v", completedAt.Valid, tt.wantValid)
			}
		})
	}
}
