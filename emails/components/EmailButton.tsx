import { Button, Section } from '@react-email/components'

interface EmailButtonProps {
    href: string
    children: string
}

export function EmailButton({ href, children }: EmailButtonProps) {
    return (
        <Section style={{ textAlign: 'center' as const, margin: '24px 0' }}>
            <Button style={styles.button} href={href}>
                {children}
            </Button>
        </Section>
    )
}

const styles = {
    button: {
        backgroundColor: '#D06D2D',
        color: '#ffffff',
        padding: '14px 28px',
        borderRadius: '10px',
        fontWeight: '600' as const,
        fontSize: '15px',
        textDecoration: 'none',
        display: 'inline-block' as const,
        textAlign: 'center' as const,
    },
}
