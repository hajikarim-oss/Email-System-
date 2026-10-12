import Request from "../../Request";

export interface UniboxTeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  mailboxIds: string[];
  unread: number;
}

export default async function getTeamMembers(): Promise<UniboxTeamMember[]> {
  return await Request<UniboxTeamMember[]>({
    method: "GET",
    url: "/unibox/team",
    authorization: true,
  });
}
