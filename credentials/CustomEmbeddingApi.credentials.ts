import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class CustomEmbeddingApi implements ICredentialType {
	name = 'customEmbeddingApi';
	displayName = 'OpenAI-Compatible API';
	documentationUrl = 'https://platform.openai.com/docs/api-reference';
	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'http://localhost:8000/v1',
			description: 'Root URL of the OpenAI-compatible API (must include /v1)',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'Bearer token if required (leave empty if not enforced)',
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: 'Bearer {{$credentials.apiKey}}',
			},
		},
	};
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/models',
			method: 'GET',
		},
		rules: [
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'data',
					message: 'Connection established successfully',
					value: [],
				},
			},
		],
	};
}
