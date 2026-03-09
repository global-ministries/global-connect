import {
    Html,
    Body,
    Head,
    Container,
    Section,
    Text,
    Hr,
    Img,
} from '@react-email/components'
import type { ReactNode } from 'react'

interface EmailLayoutProps {
    preview: string
    children: ReactNode
}

export function EmailLayout({ preview, children }: EmailLayoutProps) {
    return (
        <Html lang="es" dir="ltr">
            <Head />
            <Body style={styles.body}>
                <Container style={styles.container}>
                    {/* Preview text (invisible en el email, visible en bandeja de entrada) */}
                    <Text style={styles.preview}>{preview}</Text>

                    {/* Header */}
                    <Section style={styles.header}>
                        <Img
                            src="https://connect.yosoyglobal.org/logo.png"
                            width="40"
                            height="40"
                            alt="GlobalConnect"
                            style={styles.logo}
                        />
                        <Text style={styles.brandName}>GlobalConnect</Text>
                    </Section>

                    {/* Content */}
                    <Section style={styles.content}>{children}</Section>

                    <Hr style={styles.divider} />

                    {/* Footer */}
                    <Section style={styles.footer}>
                        <Text style={styles.footerText}>
                            GlobalConnect · Global Barquisimeto
                        </Text>
                        <Text style={styles.footerText}>
                            Este es un correo automático, por favor no respondas directamente.
                        </Text>
                    </Section>
                </Container>
            </Body>
        </Html>
    )
}

const styles = {
    body: {
        backgroundColor: '#0f0f13',
        fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        margin: '0',
        padding: '40px 0',
    },
    preview: {
        display: 'none' as const,
        fontSize: '1px',
        lineHeight: '1px',
        maxHeight: '0',
        maxWidth: '0',
        overflow: 'hidden' as const,
        opacity: 0,
    },
    container: {
        maxWidth: '560px',
        margin: '0 auto',
        backgroundColor: '#1a1a24',
        borderRadius: '16px',
        overflow: 'hidden' as const,
        border: '1px solid rgba(255, 255, 255, 0.08)',
    },
    header: {
        padding: '32px 40px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    },
    logo: {
        display: 'inline-block' as const,
        verticalAlign: 'middle' as const,
        marginRight: '12px',
    },
    brandName: {
        fontSize: '18px',
        fontWeight: '600' as const,
        color: '#ffffff',
        margin: '0',
        display: 'inline-block' as const,
        verticalAlign: 'middle' as const,
    },
    content: {
        padding: '40px',
    },
    divider: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        margin: '0',
    },
    footer: {
        padding: '24px 40px',
    },
    footerText: {
        fontSize: '12px',
        color: '#4b5563',
        textAlign: 'center' as const,
        margin: '0 0 4px',
        lineHeight: '1.5',
    },
}
