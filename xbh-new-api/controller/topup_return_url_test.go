package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/stretchr/testify/require"
)

func TestGetEpayReturnUrl(t *testing.T) {
	originalServerAddress := system_setting.ServerAddress
	t.Cleanup(func() {
		system_setting.ServerAddress = originalServerAddress
	})

	system_setting.ServerAddress = "https://newapi.example.com"

	testCases := []struct {
		name      string
		input     string
		want      string
		wantError bool
	}{
		{
			name:  "empty uses NewAPI console default",
			input: "",
			want:  "https://newapi.example.com/console/log",
		},
		{
			name:  "absolute portal url is accepted",
			input: "https://portal.example.com/dashboard/billing?payment=return#ignored",
			want:  "https://portal.example.com/dashboard/billing?payment=return",
		},
		{
			name:      "relative url is rejected",
			input:     "/dashboard/billing",
			wantError: true,
		},
		{
			name:      "non http scheme is rejected",
			input:     "javascript:alert(1)",
			wantError: true,
		},
		{
			name:      "userinfo is rejected",
			input:     "https://user:pass@portal.example.com/dashboard/billing",
			wantError: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := getEpayReturnUrl(tc.input)

			if tc.wantError {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			require.Equal(t, tc.want, got.String())
		})
	}
}
