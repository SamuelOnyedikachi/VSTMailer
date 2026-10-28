export type Config = {
    mode: 'local' | 'production';
    appUrl: string;
    hostedDomain: string;
    authFrom: string;
    transport: 'smtp-local' | 'postal';
    postalUrl: string;
    postalKey: string;
    ingressToken: string;
    operatorToken: string;
};
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    const mode = env.APP_MODE === 'production' ? 'production' : 'local';
    if (env.APP_MODE && !['production', 'local'].includes(env.APP_MODE))
        throw new Error('Invalid APP_MODE');
    if (env.NODE_ENV === 'production' && mode !== 'production')
        throw new Error('Production requires APP_MODE=production');
    const config: Config = { mode, appUrl: env.APP_URL || 'http://localhost:3000', hostedDomain: env.HOSTED_SENDING_DOMAIN || 'send.vstmailer.test', authFrom: env.AUTH_FROM || 'accounts@auth.vstmailer.test', transport: env.TRANSPORT === 'postal' ? 'postal' : 'smtp-local', postalUrl: env.POSTAL_URL || '', postalKey: env.POSTAL_API_KEY || '', ingressToken: env.POSTAL_INGRESS_TOKEN || '', operatorToken: env.OPERATOR_TOKEN || '' };
    if (mode === 'production') {
        if (config.transport !== 'postal' || !config.postalUrl.startsWith('https://') || !config.postalKey)
            throw new Error('Production requires HTTPS Postal transport credentials');
        if (!config.appUrl.startsWith('https://') || /\.(test|example|localhost)$/.test(config.hostedDomain))
            throw new Error('Production requires HTTPS and a real sending domain');
        if (config.ingressToken.length < 32 || config.operatorToken.length < 32)
            throw new Error('Production requires separate ingress/operator secrets of at least 32 characters');
    }
    return config;
}
