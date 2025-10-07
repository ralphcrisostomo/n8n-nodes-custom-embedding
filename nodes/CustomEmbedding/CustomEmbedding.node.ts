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

import { OpenAIEmbeddings } from '@langchain/openai';

// type EmbeddingHTTPResponse = {
// 	data?: Array<{ embedding: number[] }>;
// 	model?: string;
// };

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
		outputNames: ['Embeddings'],
		credentials: [{ name: 'customEmbeddingApi', required: true }],
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Embeddings'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.embeddingsopenai/',
					},
				],
			},
		},

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
			// {
			// 	displayName: 'Additional Body Fields (JSON)',
			// 	name: 'extraBody',
			// 	type: 'json',
			// 	default: {},
			// 	description:
			// 		'Merged into the request body. Example: {"input_type":"query","encoding_format":"float"}.',
			// },
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

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		this.logger.debug('Supply data for embeddings');
		const credentials = await this.getCredentials('customEmbeddingApi');
		const model = this.getNodeParameter('model', itemIndex) as string;
		const options = {}

		const embeddings = new OpenAIEmbeddings({
			model,
			apiKey: credentials.apiKey as string,
			...options,
			configuration: {
				baseURL: credentials.baseUrl as string,
			},
		});

		return {
			response: {
				...embeddings,
				embeddings
			},
		};

		// Создаем объект с методом embedQuery для vector store
		// const embeddingProvider = {
		// 	embedQuery: async (text: string): Promise<number[]> => {
		// 		const credentials = await this.getCredentials('customEmbeddingApi');
		// 		const model = this.getNodeParameter('model', itemIndex) as string;
		// 		const encodingFormat = 'base64';
		//
		// 		if (!text || !text.trim()) {
		// 			new NodeOperationError(this.getNode(), 'No text provided to embed', { itemIndex });
		// 		}
		//
		// 		const embeddings = new OpenAIEmbeddings({
		// 			configuration: {
		// 				baseURL: credentials.baseUrl as string,
		// 			},
		// 			apiKey: credentials.apiKey as string,
		// 			model: model,
		// 		});
		//
		// 		console.log(JSON.stringify({ embeddings }, null, 2));
		//
		// 		// @ts-ignore
		// 		const { data } = await embeddings.embeddingWithRetry({
		// 			model: model,
		// 			input: text,
		// 			encoding_format: encodingFormat,
		// 		});
		//
		// 		console.log(JSON.stringify({ data }, null, 2));
		//
		// 		return data[0].embedding;
		// 	},
		// };
		//
		// console.log(JSON.stringify({ embeddingProvider }, null, 2));
		//
		// return {
		// 	response: embeddingProvider,
		// };
	}

	// Embedding provider for Vector Store / Agent nodes
	// async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
	// 	const creds = (await this.getCredentials('customEmbeddingApi')) as {
	// 		baseUrl: string;
	// 		apiKey?: string;
	// 	};
	// 	const baseUrl = (creds.baseUrl || '').replace(/\/+$/, '');
	// 	const url = `${baseUrl}/embeddings`;
	//
	// 	const model = this.getNodeParameter('model', itemIndex) as string;
	// 	const extraBody = this.getNodeParameter('extraBody', itemIndex, {}) as Record<string, unknown>;
	//
	// 	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	// 	if (creds.apiKey) headers.Authorization = `Bearer ${creds.apiKey}`;
	//
	// 	// Add input_type per-call; don't override if user already supplied it in extraBody.
	// 	const call = async (texts: string[], inputType?: 'query' | 'document') => {
	// 		if (!Array.isArray(texts) || texts.length === 0) {
	// 			throw new NodeOperationError(this.getNode(), 'No text provided to embed', { itemIndex });
	// 		}
	//
	// 		const body: Record<string, unknown> = {
	// 			model,
	// 			input: texts,
	// 			...extraBody,
	// 		};
	//
	// 		// If server requires input_type and user didn't specify, set it based on the call context.
	// 		if (!('input_type' in body) && inputType) {
	// 			body.input_type = inputType;
	// 		}
	//
	// 		console.log(JSON.stringify({body}, null, 2))
	//
	// 		const res = (await this.helpers.httpRequest({
	// 			method: 'POST',
	// 			url,
	// 			headers,
	// 			body,
	// 			json: true,
	// 		})) as EmbeddingHTTPResponse;
	//
	// 		if (!res?.data || res.data.length !== texts.length) {
	// 			throw new NodeOperationError(
	// 				this.getNode(),
	// 				'Embedding API returned unexpected data shape',
	// 				{ itemIndex },
	// 			);
	// 		}
	// 		return res.data.map((d) => d.embedding);
	// 	};
	//
	// 	const embeddings = {
	// 		model,
	// 		// Queries -> ensure input_type = "query"
	// 		embedQuery: async (text: string): Promise<number[]> => (await call([text], 'query'))[0],
	// 		// Documents -> ensure input_type = "document"
	// 		embedDocuments: async (docs: string[]): Promise<number[][]> => call(docs, 'document'),
	// 	};
	//
	// 	return { response: { embeddings } };
	// }

}
