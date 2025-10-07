import {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    NodeConnectionType,
} from 'n8n-workflow';

type EmbeddingResponse = {
    object: string;
    model: string;
    data: Array<{ index: number; object: 'embedding'; embedding: number[] }>;
};

export class CustomEmbedding implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Custom Embedding',
        name: 'customEmbedding',
        icon: { light: 'file:CustomEmbedding.svg', dark: 'file:CustomEmbedding.svg' },
        group: ['transform'],
        version: 1,
        description:
            'Generate embeddings from any OpenAI-compatible API (supports custom body fields like input_type)',
        defaults: { name: 'Custom Embedding' },
        inputs: ['main'] as NodeConnectionType[],
        outputs: ['main'] as NodeConnectionType[],
        credentials: [{ name: 'openAICompatApi', required: true }],
        properties: [
            {
                displayName: 'Model',
                name: 'model',
                type: 'string',
                default: '',
                required: true,
                description: 'Model ID to use for embeddings',
            },
            {
                displayName: 'Text Field',
                name: 'textField',
                type: 'string',
                default: 'text',
                description:
                    'Field name in the incoming JSON that contains the text to embed',
            },
            {
                displayName: 'Additional Body Fields (JSON)',
                name: 'extraBody',
                type: 'json',
                default: {},
                description:
                    'Extra key-value pairs to include in the embedding request (e.g., {"input_type": "query"})',
            },
            {
                displayName: 'Output Mode',
                name: 'outputMode',
                type: 'options',
                default: 'vector',
                options: [
                    { name: 'Vector only', value: 'vector' },
                    { name: 'Full API response', value: 'raw' },
                    { name: 'Qdrant point', value: 'qdrant' },
                ],
            },
            {
                displayName: 'Payload Fields (comma separated)',
                name: 'payloadFields',
                type: 'string',
                default: 'id,source',
                description:
                    'Fields from the incoming item to include in Qdrant payload (only used if Output Mode = Qdrant point)',
            },
        ],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const creds = await this.getCredentials('openAICompatApi') as {
            baseUrl: string;
            apiKey?: string;
        };

        const baseUrl = creds.baseUrl.replace(/\/+$/, '');
        const url = `${baseUrl}/embeddings`;
        const model = this.getNodeParameter('model', 0) as string;
        const textField = this.getNodeParameter('textField', 0) as string;
        const extraBody = this.getNodeParameter('extraBody', 0, {}) as Record<
            string,
            unknown
        >;
        const outputMode = this.getNodeParameter('outputMode', 0) as string;
        const payloadFieldsCsv = this.getNodeParameter('payloadFields', 0, '') as string;

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (creds.apiKey) headers['Authorization'] = `Bearer ${creds.apiKey}`;

        const out: INodeExecutionData[] = [];

        for (let i = 0; i < items.length; i++) {
            const text = items[i].json[textField];
            if (typeof text !== 'string' || !text.trim()) {
                throw new Error(`Item ${i} has no valid text in field "${textField}"`);
            }

            const body: Record<string, unknown> = {
                model,
                input: [text],
                ...extraBody,
            };

            const res = (await this.helpers.httpRequest({
                method: 'POST',
                url,
                headers,
                body,
                json: true,
            })) as EmbeddingResponse;

            const vector = res?.data?.[0]?.embedding;

            if (!Array.isArray(vector)) {
                throw new Error('No embedding vector returned from API');
            }

            if (outputMode === 'raw') {
                out.push({ json: res });
            } else if (outputMode === 'qdrant') {
                const src = items[i].json;
                const payloadFields = payloadFieldsCsv
                    .split(',')
                    .map((f) => f.trim())
                    .filter(Boolean);

                const payload: Record<string, unknown> = { text };
                for (const key of payloadFields) {
                    if (src[key] !== undefined) payload[key] = src[key];
                }

                out.push({
                    json: {
                        point: {
                            id: src.id ?? `${Date.now()}-${i}`,
                            vector,
                            payload,
                        },
                    },
                });
            } else {
                out.push({
                    json: {
                        text,
                        vector,
                        dimension: vector.length,
                        model: res.model,
                    },
                });
            }
        }

        return [out];
    }
}
