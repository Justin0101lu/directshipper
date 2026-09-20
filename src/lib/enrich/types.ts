export type Person = { name?: string | null; title?: string | null; linkedin?: string | null; email?: string | null; phone?: string | null };
export type Provider = {
  id: string;
  ready: () => boolean;
  /* People in freight roles at a company, several at once. */
  findPeople?: (company: string, domain: string | null, titles: string[], size: number) => Promise<Person[] | null>;
  /* Verified work email for a named person at a domain. */
  findEmail?: (name: string, domain: string) => Promise<string | null>;
  /* Direct or mobile phone for a named person. */
  findPhone?: (name: string, company: string, linkedin: string | null) => Promise<string | null>;
  /* Company website from its name. */
  findDomain?: (company: string) => Promise<string | null>;
};
