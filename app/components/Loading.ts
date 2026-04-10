import { defineComponent } from '../../framework/index.js'

export const Loading = defineComponent({
    setup() {
        return {
            template: `
                <div style="display: flex; justify-content: center; align-items: center; padding: 2rem;">
                    <div style="
                        width: 40px; 
                        height: 40px; 
                        border: 4px solid #f3f3f3; 
                        border-top: 4px solid #3b82f6; 
                        border-radius: 50%; 
                        animation: spin 1s linear infinite;
                    "></div>
                    <style>
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    </style>
                </div>
            `
        }
    }
})
