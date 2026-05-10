package processors

import (
	"encoding/json"
	"strings"

	"github.com/ksushant6566/mindtab/server/internal/worker"
	"github.com/ksushant6566/mindtab/server/internal/worker/steps"
)

func withExtractResult(prevResults worker.StepResults, extract steps.ExtractResult) (worker.StepResults, error) {
	data, err := json.Marshal(extract)
	if err != nil {
		return nil, err
	}
	results := make(worker.StepResults, len(prevResults)+1)
	for name, result := range prevResults {
		results[name] = result
	}
	results["extract"] = &worker.StepResult{Data: data}
	return results, nil
}

func writeLine(b *strings.Builder, value string) {
	if strings.TrimSpace(value) == "" {
		return
	}
	b.WriteString(value)
	b.WriteString("\n")
}
