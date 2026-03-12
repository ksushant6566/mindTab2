package email

import (
	"fmt"

	"github.com/resend/resend-go/v2"
)

const fromAddress = "MindTab <noreply@communications.mindtab.in>"

type Service struct {
	client *resend.Client
}

func NewService(apiKey string) *Service {
	return &Service{client: resend.NewClient(apiKey)}
}

func (s *Service) SendVerificationCode(to, code string) error {
	_, err := s.client.Emails.Send(&resend.SendEmailRequest{
		From:    fromAddress,
		To:      []string{to},
		Subject: "Verify your MindTab account",
		Text:    fmt.Sprintf("Your verification code is: %s\n\nIt expires in 24 hours.", code),
	})
	return err
}

func (s *Service) SendPasswordResetCode(to, code string) error {
	_, err := s.client.Emails.Send(&resend.SendEmailRequest{
		From:    fromAddress,
		To:      []string{to},
		Subject: "Reset your MindTab password",
		Text:    fmt.Sprintf("Your password reset code is: %s\n\nIt expires in 15 minutes.", code),
	})
	return err
}
