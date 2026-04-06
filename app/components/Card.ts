export interface CardProps {
    title?: string
}

export interface CardResult {
    get title(): string
    template: string
}

export const Card = defineComponent({
    props: {
        title: { type: String, default: 'Default Card' }
    },
    setup(props: CardProps): CardResult {
        return {
            get title(): string { return props.title || 'Default Card' },
            template: `
                <div style="border: 2px solid #333; border-radius: 8px; padding: 20px; margin: 20px 0; background: #1a1a1a;">
                    <div style="border-bottom: 1px solid #444; padding-bottom: 10px; margin-bottom: 15px;">
                        <h2 style="margin: 0; color: #fff;">{{ title }}</h2>
                        <slot name="header">
                            <p style="color: #888; font-size: 0.9rem;">Default header content</p>
                        </slot>
                    </div>
                    
                    <div style="color: #ccc; line-height: 1.6;">
                        <slot>
                            <p>This is the default slot content. You can override this by passing content between component tags.</p>
                        </slot>
                    </div>
                    
                    <div style="border-top: 1px solid #444; padding-top: 10px; margin-top: 15px;">
                        <slot name="footer">
                            <p style="color: #666; font-size: 0.8rem; text-align: right;">Default footer</p>
                        </slot>
                    </div>
                </div>
            `
        }
    }
})
