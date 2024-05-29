import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
const dynamodbClient = new DynamoDBClient();
import { DeleteCommand, PutCommand, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from "uuid";
import { ApiGatewayManagementApi } from "@aws-sdk/client-apigatewaymanagementapi";

export const onConnect = async (chimeId, connectionId) => {
  await dynamodbClient.send(
    new PutCommand({
      TableName: "YOUR_TABLE_NAME",
      Item: {
        connectionId,
        chimeId,
        //add other custom properties as required
      },
    })
  );
  return {
    statusCode: 200,
  };
};

export const getAllUsers = async () => {
	const response = await dynamodbClient.send(
    new ScanCommand({
      TableName: "YOUR_TABLE_NAME",
    })
  );
	return response.Item;
};

export const sendMessage = async (domainName, stage, body, connectionId) => {
	Logger.info(`Sending message to connection ${connectionId}`);

	Logger.info(`Body : ${JSON.stringify(body)}`);

	const endpoint = 'https://' + domainName + '/' + stage;

	const params = {
		ConnectionId: connectionId,
		Data: JSON.stringify(body),
	};

	return new ApiGatewayManagementApi(endpoint).postToConnection(params);
};

export const sendPresencesToUsers = async (
	domainName,
	stage,
	chimeId,
    status,
	userConnectionId,
	users,
) => {
	await Promise.all(
		users.map(async (user) => {
			const { connectionId } = user;
			const body = {
				eventId: uuidv4(),
				requestId: null,
				eventName: 'CHAT_USERS_PRESENCE',
				eventTime: new Date().getTime(),
				data: {
					users: [
						{
							connectionId: userConnectionId,
							chimeId,
							status,
						},
					],
				},
			};
			Logger.info(JSON.stringify(body));
			await sendMessage(domainName, stage, body, connectionId);
		}),
	);
}
export const deleteConnectionById = async (domainName,stage,connectionId,chimeId) => {
    //delete entry from dynamoDb
	await dynamodbClient.send(
		new DeleteCommand({
			TableName: "YOUR_TABLE_NAME",
			Key: { connectionId },
		}),
	);

    //get all active users
    const activeUsers = await getAllUsers();

    //send offline status to all connected users
    await sendPresencesToUsers(domainName,stage,chimeId,'OFFLINE',connectionId,activeUsers);

};

export const sendOnlineStatus = async (stage, chimeId, connectionId, domainName) => {
    //get all active users
    const users = await getAllUsers();

	await Promise.all(
		users.map(async (user) => {
			const { connectionId: userConnectionId } = user;
			const body = {
				eventId: uuidv4(),
				requestId: null,
				eventName: 'CHAT_USERS_PRESENCE',
				eventTime: new Date().getTime(),
				data: {
					users: [
						{
							connectionId,
							chimeId,
							status: 'ONLINE',
						},
					],
				},
			};

			await sendMessage(domainName, stage, body, userConnectionId);
		}),
	);
};

export const getUserByConnectionId = async (connectionId) => {
	const response = await dynamodbClient.send(
		new GetCommand({
			TableName: "YOUR_TABLE_NAME",
			Key: { connectionId },
		}),
	);
	return response.Item;
};

export const sendUsersToMyself = async (stage, connectionId, domainName) => {
	 //get all active users
    const users = await getAllUsers();

	await sendMessage(
		domainName,
		stage,
		{
			eventId: v4(),
			requestId: null,
			eventName: SOCKET_EVENTS.SUBSCRIBE_CHAT_USERS_PRESENCE,
			eventTime: new Date().getTime(),
			data: {
				users,
			},
		},
		connectionId,
	);
};

export const createUnreadEntry = async (chimeId, channels) => {
	await dynamodbClient.send(
		new PutCommand({
			TableName: "YOUR_TABLE_NAME",
			Item: {
				chimeId,
				channels,
			},
		}),
	);
};

export const getUserByUserArn = async (userArn) => {
	const response = await dynamodbClient.send(
		new GetCommand({
			TableName: "YOUR_TABLE_NAME",
			Key: { chimeId: userArn },
		}),
	);
	return response.Item;
};

export const updateUnreadCount = async (userArns, channelId) => {
	 for (const userArn of userArns) {
     const userEntry = await getUserByUserArn(userArn);
     const channels = userEntry ? [...userEntry.channels] : [];

     const index = channels.findIndex((ch) => ch.id === channelId);
     if (index > -1) {
       channels[index].count += 1;
     } else {
       channels.push({ id: channelId, count: 1 });
     }
     await createUnreadEntry(userArn, channels);
   }
	return {
		statusCode: 200,
	};
};

export const deleteUnreadEntry = async (chimeId) => {
	return dynamodbClient.send(
		new DeleteCommand({
			TableName: '',
			Key: {
				chimeId,
			},
		}),
	);
};
export const resetUnreadCount = async (userArn, channelId) => {
	const userEntry = await getUserByUserArn(userArn);
	let channels = [];
	if (userEntry) {
		const { channels: channelsEntry } = userEntry;
		channels.push(...channelsEntry);
		const index = channelsEntry.findIndex((ch) => ch.id === channelId);
		//if the user have unread channels entry
		if (index > -1) {
			channels = channels.filter((ch) => ch.id !== channelId);
			if (channels.length > 0) {
				//if the user is having other channels, update the entry with the latest channel list
				await createUnreadEntry(userArn, channels);
			} else {
				//if the user has only the channel to be reseted, delete the entry
				await deleteUnreadEntry(userArn);
			}
		}
		await createUnreadEntry(userArn, channels);
	}
	return {
		statusCode: 200,
	};
};

export const getUnreadCount = async (userArn, stage, domainName, connectionId) => {
	const channels = [];
	const userEntry = await getUserByUserArn(userArn);
	if (userEntry) {
		const { channels: channelsEntry } = userEntry;
		channels.push(...channelsEntry);
	}
	await sendMessage(
		domainName,
		stage,
		{
			eventId: v4(),
			requestId: null,
			eventName: 'GET_UNREAD_COUNT',
			eventTime: new Date().getTime(),
			data: {
				channels,
			},
		},
		connectionId,
	);
};


export const webSocketOnMessage = async (stage, body, connectionId, domainName) => {
	const { eventName, channelId, userArns } = body;
	const user = await getUserByConnectionId(connectionId);
	const { chimeId } = user;
	switch (eventName) {
        case 'SUBSCRIBE_CHAT_USERS_PRESENCE':
			await sendUsersToMyself(stage, connectionId, domainName);
			break;
		case 'SEND_ONLINE_STATUS':
			await sendOnlineStatus(stage, chimeId, connectionId, domainName);
			break;
		case 'UPDATE_UNREAD_COUNT':
			await updateUnreadCount(userArns, channelId);
			break;
		case 'RESET_UNREAD_COUNT':
			await resetUnreadCount(userArns[0], channelId);
			break;
		case 'GET_UNREAD_COUNT':
			await getUnreadCount(userArns[0], stage, domainName, connectionId);
			break;
		default:
			throw new Error(`Unrecognized event: ${eventName}`);
	}
	return {
		statusCode: 200,
	};
};