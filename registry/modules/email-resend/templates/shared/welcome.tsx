import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Tailwind,
  Text,
  pixelBasedPreset,
} from "react-email";

interface WelcomeEmailProps {
  name: string;
  verificationUrl: string;
}

export function WelcomeEmail({ name, verificationUrl }: WelcomeEmailProps) {
  return (
    <Html lang="en">
      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Head />
        <Body className="bg-gray-100 font-sans">
          <Preview>Welcome — verify your email</Preview>
          <Container className="mx-auto max-w-xl p-5">
            <Heading className="text-2xl text-gray-900">Welcome, {name}!</Heading>
            <Text className="text-base text-gray-800">
              Thanks for signing up. Click the button below to verify your email and finish setting
              up your account.
            </Text>
            <Button
              href={verificationUrl}
              className="box-border block rounded bg-black px-5 py-3 text-center text-white no-underline"
            >
              Verify email
            </Button>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

WelcomeEmail.PreviewProps = {
  name: "Jane",
  verificationUrl: "https://example.com/verify/abc123",
} satisfies WelcomeEmailProps;

export default WelcomeEmail;
