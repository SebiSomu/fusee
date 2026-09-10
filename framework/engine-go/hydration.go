package hydration

import (
	"encoding/json"
	"fmt"
)

type Payload struct {
	Resources map[string]map[string]any `json:"resources"`
	Signals   map[string][]any          `json:"signals"`
}

func RenderDehydrationScript(resources map[string]map[string]any, signals map[string][]any) (string, error) {
	if resources == nil {
		resources = map[string]map[string]any{}
	}
	if signals == nil {
		signals = map[string][]any{}
	}

	payload := Payload{Resources: resources, Signals: signals}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("hydration: failed to serialize state: %w", err)
	}

	return fmt.Sprintf(`<script id="__FUSEE_DATA__">window.__FUSEE_STATE__ = %s;</script>`, raw), nil
}
