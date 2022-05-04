import Discord, { MessageEmbed } from 'discord.js';
import dotenv from 'dotenv';
import cron from 'cron';
import axios from 'axios';
import { JSDOM } from 'jsdom';

import queries from './queries.json';

dotenv.config();

type sectionInfo = {
  section: string;
  enrolled: number;
  effectiveEnrolled: number;
  capacity: number;
  effectiveCapacity: number;
  open: boolean;
  effectiveOpen: boolean;
}

const client = new Discord.Client({
  intents: [
    Discord.Intents.FLAGS.GUILDS,
    Discord.Intents.FLAGS.GUILD_MESSAGES,
    Discord.Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    Discord.Intents.FLAGS.DIRECT_MESSAGES,
    Discord.Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
  ],
});

process.on('uncaughtException', (e) => console.log(e));

process.on('unhandledRejection', (e) => console.log(e));

const runQueries = async () => {
  // eslint-disable-next-line no-restricted-syntax
  for (const query of queries.classes) {
    // eslint-disable-next-line no-await-in-loop
    const guild = await client.guilds.fetch(query.user.guild);
    // eslint-disable-next-line no-await-in-loop
    const channel = await guild.channels.fetch(query.user.channel);
    const target = (channel as Discord.TextChannel);

    const url = `https://classes.uwaterloo.ca//cgi-bin/cgiwrap/infocour/salook.pl?level=${query.class.level}&sess=${query.class.sess}&subject=${query.class.subject}&cournum=${query.class.cournum}`;
    // eslint-disable-next-line no-await-in-loop
    const res = await axios.get(url);
    const dom = new JSDOM(res.data);

    const { rows } = dom.window.document.querySelectorAll('tbody')[1];

    const sections: Array<sectionInfo> = [];
    let section = 'INITIAL';
    let open = false;
    let effectiveOpen = false;
    let enrolled = -1;
    let effectiveEnrolled = -1;
    let capacity = -1;
    let effectiveCapacity = -1;

    // eslint-disable-next-line no-plusplus
    for (let i = 1; i < rows.length; ++i) {
      const row = rows.item(i);
      const ch = row?.children!;

      if (ch.length === 13) {
        if (section !== 'INITIAL') {
          sections.push({
            section,
            open,
            effectiveOpen,
            enrolled,
            effectiveEnrolled,
            capacity,
            effectiveCapacity,
          });
        }

        section = ch.item(1)?.innerHTML.trim()!;
        enrolled = parseInt(ch.item(7)?.innerHTML.trim()!, 10);
        effectiveEnrolled = enrolled;
        capacity = parseInt(ch.item(6)?.innerHTML.trim()!, 10);
        effectiveCapacity = capacity;
        open = enrolled < capacity;
        effectiveOpen = open;
      } else if (ch.length === 7) {
        if (section !== 'INITIAL') {
          effectiveEnrolled -= parseInt(ch.item(2)?.innerHTML.trim()!, 10);
          effectiveCapacity -= parseInt(ch.item(1)?.innerHTML.trim()!, 10);
          effectiveOpen = effectiveEnrolled < effectiveCapacity;
        }
      }
    }

    sections.push({
      section,
      open,
      effectiveOpen,
      enrolled,
      effectiveEnrolled,
      capacity,
      effectiveCapacity,
    });

    // eslint-disable-next-line no-plusplus
    // eslint-disable-next-line no-restricted-syntax
    for (const sec of sections) {
      // eslint-disable-next-line no-continue
      if (!query.class.sections.includes(sec.section)) continue;
      if (query.options.reserves) {
        const embed = new MessageEmbed()
          .setColor(sec.open ? '#0099ff' : '#990044')
          .setTitle(`${query.class.subject} ${query.class.cournum}   -   ${sec.section} is ${sec.open ? 'OPEN' : 'FULL'}`)
          .setURL('https://adfs.uwaterloo.ca/adfs/ls/idpinitiatedsignon.aspx?LoginToRP=urn:quest.ss.apps.uwaterloo.ca')
          .setDescription(`Currently enrolled ${sec.enrolled} of capacity ${sec.capacity}\nCurrently enrolled ${sec.effectiveEnrolled} in non reserved portions of capacity ${sec.effectiveCapacity}`)
          .addField('Able to use reserves', `<@${query.user.user}>`)
          .setTimestamp()
          .setFooter({ text: 'add-monitor' });

        if (sec.open) {
          target.send({ content: `<@${query.user.user}>`, embeds: [embed] });
          // eslint-disable-next-line no-await-in-loop
          const person = await client.users.fetch(query.user.user);
          person.send({ embeds: [embed] });
        } else {
          target.send({ embeds: [embed] });
        }
      } else {
        const embed = new MessageEmbed()
          .setColor(sec.effectiveOpen ? '#0099ff' : '#990044')
          .setTitle(`${query.class.subject} ${query.class.cournum}   -   ${sec.section} is ${sec.effectiveOpen ? 'OPEN' : 'FULL'}`)
          .setURL('https://adfs.uwaterloo.ca/adfs/ls/idpinitiatedsignon.aspx?LoginToRP=urn:quest.ss.apps.uwaterloo.ca')
          .setDescription(`Currently enrolled ${sec.enrolled} of capacity ${sec.capacity}\nCurrently enrolled ${sec.effectiveEnrolled} in non reserved portions of capacity ${sec.effectiveCapacity}`)
          .addField('Unable to use reserves', `<@${query.user.user}>`)
          .setTimestamp()
          .setFooter({ text: 'add-monitor' });

        if (sec.effectiveOpen) {
          target.send({ content: `<@${query.user.user}>`, embeds: [embed] });
          // eslint-disable-next-line no-await-in-loop
          const person = await client.users.fetch(query.user.user);
          person.send({ embeds: [embed] });
        } else {
          target.send({ embeds: [embed] });
        }
      }
    }
  }
};

client.once('ready', () => {
  console.log('Ready!');

  const job = new cron.CronJob('00 */15 * * * *', runQueries);
  job.start();
});

client.login(process.env.BOT_TOKEN_ADD_MONITOR);
