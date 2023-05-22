import { IFluidContainer, ISharedMap, SharedMap } from "fluid-framework";
import { AzureMember } from "@fluidframework/azure-client";
import { NoteData, Position } from "./Types";

const c_NoteIdPrefix = "noteId_";
const c_PositionPrefix = "position_";
const c_AuthorPrefix = "author_";
const c_LastEditedPrefix = "lastEdited_";
const c_votePrefix = "vote_";
const c_TextPrefix = "text_";
const c_ColorPrefix = "color_";

export type BrainstormModel = Readonly<{
	CreateNote(noteId: string, myAuthor: AzureMember): NoteData;
	MoveNote(noteId: string, newPos: Position): void;
	SetNote(noteId: string, newCardData: NoteData): void;
	SetNoteText(
		noteId: string,
		noteText: string,
		lastEditedId: string,
		lastEditedName: string,
		lastEditedTime: number,
	): void;
	GenerateText(
		noteId: string,
		lastEditedId: string,
		lastEditedName: string,
		lastEditedTime: number,
	): void;
	SetNoteColor(noteId: string, noteColor: string): void;
	LikeNote(noteId: string, author: AzureMember): void;
	GetNoteLikedUsers(noteId: string): AzureMember[];
	DeleteNote(noteId: string): void;
	NoteIds: string[];
	setChangeListener(listener: () => void): void;
	removeChangeListener(listener: () => void): void;
}>;

export function  createBrainstormModel(fluid: IFluidContainer): BrainstormModel {
	// Global sharedMap that stores attributes of all the notes.
	// The sharedMap can be updated by any user connected to the session
	const sharedMap: ISharedMap = fluid.initialObjects.map as SharedMap;

	// check if note is complete (if it has a page position and an author)
	const IsCompleteNote = (noteId: string) => {
		if (!sharedMap.get(c_PositionPrefix + noteId) || !sharedMap.get(c_AuthorPrefix + noteId)) {
			return false;
		}
		return true;
	};

	// Check if note is deleted (noteId is 0)
	const IsDeletedNote = (noteId: string) => {
		return sharedMap.get(c_NoteIdPrefix + noteId) === 0;
	};

	// when setting the note text in the sharedMap with the new value, also update the last edited author name and time.
	const SetNoteText = (
		noteId: string,
		noteText: string,
		lastEditedId: string,
		lastEditedName: string,
		lastEditedTime: number,
	) => {
		// update the note's text in sharedMap
		sharedMap.set(c_TextPrefix + noteId, noteText);
		// update the note's last edited author name and timestamp
		// WARNING: sharedMap does not preserve object references in the DDS map the same way it would be in a conventional map data structure.
		// Hence, instead of storing the entire AzureMember object, we are only storing the necessary primitive data types metadata.
		sharedMap.set(c_LastEditedPrefix + noteId, {
			userId: lastEditedId,
			userName: lastEditedName,
			time: lastEditedTime,
		});
	};

	const GenerateText = async (
		noteId: string,
		lastEditedId: string,
		lastEditedName: string,
		lastEditedTime: number,
	) => {
		var prompt = "You are part of a team that is brainstorming on ideas. You should identify one idea and provide an output entirely in JSON format with a 'name' and 'description'. Ideas already on the list: \n";
		var notesTextArray = Array.from(sharedMap.keys())
					// Only look at keys which represent if a note exists or not
					.filter((key: String) => key.includes(c_NoteIdPrefix))
					// Modify the note ids to not expose the prefix
					.map((noteIdWithPrefix) => noteIdWithPrefix.substring(c_NoteIdPrefix.length))
					// Remove notes which are incomplete or deleted
					.filter((noteId) => IsCompleteNote(noteId) && !IsDeletedNote(noteId));
		if (notesTextArray != null) {
			for ( var i = 0; i < notesTextArray.length; i++ ) {
				var text = sharedMap.get(c_TextPrefix + notesTextArray[i]);
				if (text != null && text.length > 0) {
					if (text.indexOf(":") > 0) text = text.substring(0, text.indexOf(":"));
					prompt += i + ". " + text + "\n";
				}
			}	
		}

		const axios = require('axios');  



		const request = {
			"prompt": prompt,
			"max_tokens": 600,
			"temperature": 0.8,
			"frequency_penalty": 0,
			"presence_penalty": 0,
			"top_p": 1,
			"best_of": 1,
			"stop": null
		}			

		try
		{
			console.log("Azure OpenAI resquest:\n" + JSON.stringify(request));

			let response = await axios(
				{
					method: 'post',
					url: 'https://azure-apim-lab.azure-api.net/oepnapi/completions?api-version=2022-12-01',
					data: request,
					headers:
					{
						"Content-Type": "application/json"
					}
				}
			);
	
			console.log("Azure OpenAI response:\n" + response.data.choices[0].text);
			var idea = JSON.parse(response.data.choices[0].text);

			// update the note's text in sharedMap			
			sharedMap.set(c_TextPrefix + noteId, idea.name + ': 🤖 ' + idea.description);
			// update the note's last edited author name and timestamp
			// WARNING: sharedMap does not preserve object references in the DDS map the same way it would be in a conventional map data structure.
			// Hence, instead of storing the entire AzureMember object, we are only storing the necessary primitive data types metadata.
			sharedMap.set(c_LastEditedPrefix + noteId, {
				userId: lastEditedId,
				userName: lastEditedName,
				time: lastEditedTime,
			});

		}
		catch (err) 
		{
			console.log(err);
		}

		

	};

	const SetNoteColor = (noteId: string, noteColor: string) => {
		sharedMap.set(c_ColorPrefix + noteId, noteColor);
	};

	return {
		// Take all the note attributes data stored in the sharedMap and return it as NoteData
		CreateNote(noteId: string, myAuthor: AzureMember): NoteData {
			const newNote: NoteData = {
				id: noteId,
				lastEdited: sharedMap.get(c_LastEditedPrefix + noteId)!,
				text: sharedMap.get(c_TextPrefix + noteId),
				position: sharedMap.get(c_PositionPrefix + noteId)!,
				author: sharedMap.get(c_AuthorPrefix + noteId)!,
				numLikesCalculated: Array.from(sharedMap.keys())
					.filter((key: string) => key.includes(c_votePrefix + noteId))
					.filter((key: string) => sharedMap.get(key) !== undefined).length,
				didILikeThisCalculated:
					Array.from(sharedMap.keys())
						.filter((key: string) =>
							key.includes(c_votePrefix + noteId + "_" + myAuthor.userId),
						)
						.filter((key: string) => sharedMap.get(key) !== undefined).length > 0,
				color: sharedMap.get(c_ColorPrefix + noteId)!,
			};
			return newNote;
		},

		// Gets all the users that liked the note
		GetNoteLikedUsers(noteId: string): AzureMember[] {
			return (
				Array.from(sharedMap.keys())
					// Filter keys that represent if a note was liked
					.filter((key: string) => key.startsWith(c_votePrefix + noteId))
					.filter((key: string) => sharedMap.get(key) !== undefined)
					// Return the user associated with the like
					.map((value: string) => sharedMap.get(value)!)
			);
		},

		// Update a specific note's x and y coordinate
		MoveNote(noteId: string, newPos: Position) {
			sharedMap.set(c_PositionPrefix + noteId, newPos);
		},

		// Sets all the default note attributes when the note is created
		SetNote(noteId: string, newCardData: NoteData) {
			sharedMap.set(c_PositionPrefix + noteId, newCardData.position);
			sharedMap.set(c_AuthorPrefix + noteId, newCardData.author);
			SetNoteText(
				newCardData.id,
				newCardData.text!,
				newCardData.lastEdited.userId,
				newCardData.lastEdited.userName,
				newCardData.lastEdited.time,
			);
			sharedMap.set(c_NoteIdPrefix + noteId, 1);
			sharedMap.set(c_ColorPrefix + noteId, newCardData.color);
		},

		SetNoteText,

		GenerateText,

		SetNoteColor,

		// Set or unset the note as liked by the user
		LikeNote(noteId: string, user: AzureMember) {
			const voteString = c_votePrefix + noteId + "_" + user.userId;

			// WARNING: SharedMap does not preserve object references like a conventional map data structure, and object comparisons of SharedMap values
			// will be invalid . In this case, it is recommended to only store the necessary primitive data types in SharedMap or implement a custom
			// comparison function.
			// Due to the warning above, instead of storing the entire AzureMember object, we are only storing the necessary primitive data types metadata.
			sharedMap.get(voteString)?.userId === user.userId
				? sharedMap.set(voteString, undefined)
				: sharedMap.set(voteString, {
						userId: user.userId,
						userName: user.userName,
				  });
		},

		// Delete the note by setting the ID to 0
		DeleteNote(noteId: string) {
			sharedMap.set(c_NoteIdPrefix + noteId, 0);
		},

		// Get all the noteIds that are still alive (not incomplete or deleted)
		get NoteIds(): string[] {
			return (
				Array.from(sharedMap.keys())
					// Only look at keys which represent if a note exists or not
					.filter((key: String) => key.includes(c_NoteIdPrefix))
					// Modify the note ids to not expose the prefix
					.map((noteIdWithPrefix) => noteIdWithPrefix.substring(c_NoteIdPrefix.length))
					// Remove notes which are incomplete or deleted
					.filter((noteId) => IsCompleteNote(noteId) && !IsDeletedNote(noteId))
			);
		},

		// Attach a listener on the sharedMap to listen for any value change
		setChangeListener(listener: () => void): void {
			sharedMap.on("valueChanged", listener);
		},

		// Remove listen on the sharedMap
		removeChangeListener(listener: () => void): void {
			sharedMap.off("valueChanged", listener);
		},
	};
}
