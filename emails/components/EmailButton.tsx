import { Button } from '@react-email/components'

interface EmailButtonProps {
    href: string
    children: string
}

export function EmailButton({ href, children }: EmailButtonProps) {
    return (
        <Button style={styles.button} href={href}>
            {children}
        </Button>
    )
}

const styles = {
    button: {
        backgroundColor: '#6366f1',
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
