import {
	ILoadOptionsFunctions,
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
	NodeConnectionTypes,
	NodeOperationError,
	INodePropertyOptions,
} from 'n8n-workflow';

type EmbeddingHTTPResponse = {
	data?: Array<{ embedding: number[] }>;
	model?: string;
};

export class CustomEmbedding implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Custom Embedding',
		name: 'customEmbedding',
		group: ['transform'],
		icon: { light: 'file:CustomEmbedding.svg', dark: 'file:CustomEmbedding.svg' },
		version: 1,
		description:
			'Generate embeddings from any OpenAI-compatible API (supports custom body fields like input_type)',
		defaults: { name: 'Custom Embedding' },
		inputs: [], // provider => no inbound items
		outputs: [NodeConnectionTypes.AiEmbedding], // exposes an embedding tool
		usableAsTool: true,
		credentials: [{ name: 'customEmbeddingApi', required: true }],
		properties: [
			{
				displayName: 'Model Name or ID',
				name: 'model',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getModels' },
				default: '',
				description:
					'Select from /v1/models, or supply an ID via an <a href="https://docs.n8n.io/code/expressions/">expression</a>. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				required: true,
			},
			{
				displayName: 'Additional Body Fields (JSON)',
				name: 'extraBody',
				type: 'json',
				default: {},
				description:
					'Merged into the request body. Example: {"input_type":"query","encoding_format":"float"}.',
			},
		],
	};

	methods = {
		loadOptions: {
			async getModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentials = (await this.getCredentials('customEmbeddingApi')) as {
					baseUrl: string;
					apiKey?: string;
				};
				const baseUrl = (credentials.baseUrl || '').replace(/\/+$/, '');
				const resp = await fetch(`${baseUrl}/models`, {
					method: 'GET',
					headers: {
						'Content-Type': 'application/json',
						...(credentials.apiKey ? { Authorization: `Bearer ${credentials.apiKey}` } : {}),
					},
				});

				if (!resp.ok) {
					throw new NodeOperationError(
						this.getNode(),
						`Failed to fetch models: ${resp.status} ${resp.statusText}`,
						{ itemIndex: 0 },
					);
				}

				const result = (await resp.json()) as { data?: Array<{ id: string }> };
				return (result.data ?? []).map((m) => ({ name: m.id, value: m.id }));
			},
		},
	};

	// Embedding provider for Vector Store / Agent nodes
	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const creds = (await this.getCredentials('customEmbeddingApi')) as {
			baseUrl: string;
			apiKey?: string;
		};
		const baseUrl = (creds.baseUrl || '').replace(/\/+$/, '');
		const url = `${baseUrl}/embeddings`;

		const model = this.getNodeParameter('model', itemIndex) as string;
		const extraBody = this.getNodeParameter('extraBody', itemIndex, {}) as Record<string, unknown>;

		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (creds.apiKey) headers.Authorization = `Bearer ${creds.apiKey}`;

		const call = async (texts: string[]) => {
			if (!Array.isArray(texts) || texts.length === 0) {
				throw new NodeOperationError(this.getNode(), 'No text provided to embed', { itemIndex });
			}

			const body = { model, input: texts, ...extraBody };
			const res = (await this.helpers.httpRequest({
				method: 'POST',
				url,
				headers,
				body,
				json: true,
			})) as EmbeddingHTTPResponse;

			if (!res?.data || res.data.length !== texts.length) {
				throw new NodeOperationError(
					this.getNode(),
					'Embedding API returned unexpected data shape',
					{ itemIndex },
				);
			}
			return res.data.map((d) => d.embedding);
		};

		const provider = {
			model,
			embedQuery: async (text: string): Promise<number[]> => (await call([text]))[0],
			embedDocuments: async (docs: string[]): Promise<number[][]> => call(docs),
		};

		return { response: provider };
	}
}
